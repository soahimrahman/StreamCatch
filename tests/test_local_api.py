"""Run with `python -m unittest discover -s tests -v`.
Uses fake yt-dlp, so these tests don't contact media websites.
"""
import http.client
import json
from pathlib import Path
import sys
import threading
import time
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'helper'))
import server as engine

BASE_HEADERS = {
    'Origin': engine.EXTENSION_ORIGIN,
    'X-StreamCatch-Client': 'StreamCatch/1.1',
    'X-StreamCatch-Extension': engine.EXTENSION_ORIGIN.rsplit('/', 1)[-1],
    'Content-Type': 'application/json',
}


class FakeYdl:
    seen_options = []
    temp_folder = Path(tempfile.mkdtemp(prefix='streamcatch-tests-'))
    def __init__(self, options):
        self.options = options
        type(self).seen_options.append(options)
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def prepare_filename(self, info):
        return str(engine.DOWNLOAD_DIR / 'Mock video [xyz].mp4')
    def _finish(self, filename):
        p = self.temp_folder / filename
        p.write_bytes(b'fake video data')
        for hook in self.options['post_hooks']:
            hook(str(p))
        return str(p)
    def extract_info(self, url, download):
        if self.options.get('extract_flat') == 'in_playlist':
            return {'_type':'playlist','title':'Mock collection','playlist_count':3,
                    'entries':[{'title':'Video A','id':'a'},{'title':'Video B','id':'b'}]}
        if 'timeout' in url:
            self.options['logger'].error('\x1b[0;31mERROR:\x1b[0m Failed to perform, curl: (28) Failed to connect to www.example.org:443 after 21055 ms')
            if self.options['ignoreerrors']:
                return None
            raise RuntimeError('curl: (28) Failed to connect to server')
        if self.options['noplaylist'] is False:
            if download:
                if 'allfail' in url:
                    for n in range(3):
                        self.options['logger'].error('ERROR: playlist item is not available')
                else:
                    for n in range(3):
                        if 'partial' in url and n > 0:
                            self.options['logger'].error(f'ERROR: Item {n+1} failed to download')
                            continue
                        item={'title':f'Video {n+1}','id':str(n),'playlist_index':n+1,'n_entries':3}
                        for hook in self.options['progress_hooks']:
                            hook({'status':'downloading','downloaded_bytes':40,'total_bytes':100,'info_dict':item})
                            hook({'status':'finished','filename':'file.mp4','info_dict':item})
                        self._finish(f'playlist-item-{n}-{time.monotonic_ns()}.mp4')
            return {'_type':'playlist','title':'Mock collection',
                    'entries':[{'id':'1'},{'id':'2'},{'id':'3'}]}
        filepath = ''
        if download:
            for hook in self.options['progress_hooks']:
                hook({'status':'downloading','downloaded_bytes':80,'total_bytes':100,
                      'info_dict':{'id':'xyz'}})
            filepath=self._finish(f'single-{time.monotonic_ns()}.mp4')
        return {'title':'Mock video','id':'xyz','duration':42,'formats':[{'height':1080,'vcodec':'h264'}],
                'filepath':filepath}


class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_ydl = engine.yt_dlp
        engine.yt_dlp = type('FakeModule', (), {'YoutubeDL':FakeYdl})
        cls.server = engine.ThreadingHTTPServer(('127.0.0.1', 0), engine.AppHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=3)
        engine.yt_dlp = cls.original_ydl
    def call(self, method, path, payload=None, headers=None):
        conn=http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        conn.request(method, path, body=json.dumps(payload) if payload is not None else None,
                     headers=BASE_HEADERS if headers is None else headers)
        response=conn.getresponse()
        code=response.status; data=json.loads(response.read().decode() or '{}');conn.close()
        return code,data
    def wait(self, job_id):
        for _ in range(120):
            code, jobs=self.call('GET','/jobs')
            job=next((j for j in jobs['items'] if j['id']==job_id), None)
            if job and job['status'] in ('completed','failed','partial','cancelled'):
                return job
            time.sleep(.03)
        self.fail('Job did not finish')
    def test_01_health_and_access_control(self):
        code,data=self.call('GET','/health')
        self.assertEqual(code,200);self.assertEqual(data['version'],'1.2.1')
        code,_=self.call('GET','/health',headers={'Origin':'https://random.example'})
        self.assertEqual(code,403)
        code,_=self.call('POST','/download',{'url':'https://example.com/test.mp4'},headers={'Content-Type':'application/json'})
        self.assertEqual(code,403)
    def test_02_bulk_rejects_bad_urls_and_deduplicates(self):
        code,_=self.call('POST','/bulk-download',{'urls':['https://example.com/v','http://127.0.0.1/admin']})
        self.assertEqual(code,400)
        code,data=self.call('POST','/bulk-download',{'urls':['https://example.com/v','https://example.com/v','https://example.org/x'],'format':'mp3'})
        self.assertEqual(code,202);self.assertEqual(data['count'],2)
        self.wait(data['ids'][0]);self.wait(data['ids'][1])
    def test_03_full_playlist_and_preview(self):
        code,data=self.call('POST','/download',{'url':'https://example.com/playlist','playlist':True,'format':'mkv','resolution':'720','playlist_limit':0})
        self.assertEqual(code,202)
        job=self.wait(data['id'])
        self.assertEqual(job['status'],'completed')
        self.assertEqual(job['completed_items'],3)
        options=FakeYdl.seen_options[-1]
        self.assertEqual(options['noplaylist'],False)
        self.assertNotIn('playlistend',options)
        self.assertIn('720',options['format'])
        self.assertEqual(options['postprocessors'][0]['key'],'FFmpegVideoRemuxer')
        self.assertEqual(options['postprocessors'][0]['preferedformat'],'mkv')
        code,data=self.call('POST','/playlist-info',{'url':'https://example.com/playlist'})
        self.assertEqual(code,202)
        preview=self.wait(data['id'])
        self.assertEqual(preview['title'],'Mock collection')
        self.assertEqual(preview['total_items'],3)
        self.assertEqual(preview['kind'],'playlist_info')
    def test_04_audio_format_and_limits(self):
        code,data=self.call('POST','/download',{'url':'https://example.com/watch','format':'flac'})
        self.assertEqual(code,202)
        self.assertEqual(self.wait(data['id'])['status'],'completed')
        self.assertEqual(FakeYdl.seen_options[-1]['postprocessors'][0]['preferredcodec'],'flac')
        code,_=self.call('POST','/download',{'url':'https://example.com/watch','format':'bad'})
        self.assertEqual(code,400)
        code,_=self.call('POST','/bulk-download',{'urls':['https://example.org/video']*101})
        self.assertEqual(code,400)
    def test_05_network_timeout_is_friendly(self):
        code,data=self.call('POST','/download',{'url':'https://example.org/timeout.mp4','format':'mp4'})
        self.assertEqual(code,202)
        job=self.wait(data['id'])
        self.assertEqual(job['status'],'failed')
        self.assertEqual(job['error_code'],'network_timeout')
        self.assertNotIn('\x1b',job['error'])
        self.assertIn('connection timed out',job['error'])
        self.assertIn('browser',job['error_hint'])
        self.assertEqual(job['completed_items'],0)
    def test_06_playlist_without_any_files_is_failed(self):
        code,data=self.call('POST','/download',{'url':'https://example.com/allfail','playlist':True})
        self.assertEqual(code,202)
        job=self.wait(data['id'])
        self.assertEqual(job['status'],'failed')
        self.assertEqual(job['completed_items'],0)
        self.assertNotEqual(job['progress'],100)
        self.assertTrue(job['error'])
    def test_07_partially_downloaded_playlist_can_retry(self):
        code,data=self.call('POST','/download',{'url':'https://example.com/partial','playlist':True})
        self.assertEqual(code,202)
        job=self.wait(data['id'])
        self.assertEqual(job['status'],'partial')
        self.assertEqual(job['completed_items'],1)
        self.assertEqual(job['total_items'],3)
        self.assertLess(job['progress'],100)
        code,data=self.call('POST','/retry',{'id':job['id']})
        self.assertEqual(code,202)
        other=self.wait(data['id'])
        self.assertEqual(other['status'],'partial')
        self.assertNotEqual(other['id'],job['id'])
    def test_08_clear_finished(self):

        code,result=self.call('POST','/clear-completed',{'ok':True})
        self.assertEqual(code,200)
        self.assertGreater(result['count'],0)
        code,data=self.call('GET','/jobs')
        self.assertFalse(any(j['status']=='completed' for j in data['items']))


if __name__=='__main__': unittest.main()
