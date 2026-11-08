#!/usr/bin/env python3
"""StreamCatch 1.2.1: truthful playlist results and clear network diagnostics.

Listens on loopback only. Origin and extension headers defend against browser
webpage requests, but cannot authenticate an untrusted process on the PC.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from extension_origin import EXTENSION_ORIGIN

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

APP_DIR = Path(__file__).resolve().parent
APP_DATA = Path(os.getenv('LOCALAPPDATA') or Path.home() / '.streamcatch') / 'StreamCatch'
APP_DATA.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR = Path.home() / 'Downloads' / 'StreamCatch'
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix='streamcatch')
JOBS: dict[str, dict] = {}
LOCK = threading.RLock()
MAX_JOBS = 2500
MAX_BULK = 100
FORMATS = ('auto', 'mp4', 'mkv', 'webm', 'mp3', 'm4a', 'wav', 'flac')
RESOLUTIONS = ('best', '2160', '1440', '1080', '720', '480', '360')
BROWSERS = ('none', 'chrome', 'edge', 'firefox', 'brave')


def is_public_url(candidate: str) -> bool:
    if not isinstance(candidate, str) or len(candidate) > 4096:
        return False
    try:
        p = urlparse(candidate.strip())
        if p.scheme not in ('https', 'http') or not p.hostname or p.username or p.password:
            return False
        if p.port and p.port not in (80, 443):
            return False
        host = p.hostname.lower().rstrip('.')
        if host == 'localhost' or host.endswith(('.localhost', '.local')) or '.' not in host:
            return False
        try:
            if not ipaddress.ip_address(host).is_global:
                return False
        except ValueError:
            pass
        return True
    except Exception:
        return False


def safe_float(value):
    try:
        return round(float(value), 2)
    except (ValueError, TypeError, OverflowError):
        return None


def ffmpeg_location():
    system = shutil.which('ffmpeg')
    if system:
        return str(Path(system).parent)
    try:
        import imageio_ffmpeg
        original = Path(imageio_ffmpeg.get_ffmpeg_exe())
        folder = APP_DATA / 'bin'
        folder.mkdir(exist_ok=True)
        dest = folder / ('ffmpeg.exe' if os.name == 'nt' else 'ffmpeg')
        if not dest.exists() or dest.stat().st_size != original.stat().st_size:
            shutil.copy2(original, dest)
            if os.name != 'nt':
                dest.chmod(0o755)
        return str(folder)
    except Exception:
        return None


FFMPEG_DIR = ffmpeg_location()


def modify(job_id: str, **changes):
    with LOCK:
        job = JOBS.get(job_id)
        if job:
            job.update(changes)


def snapshot(job):
    return {k: v for k, v in job.items() if k not in ('cancel_event', '_finished_files', '_saved_files', '_errors')}


def add_job(kind, url, **kwargs):
    with LOCK:
        while len(JOBS) >= MAX_JOBS:
            old_id = next((k for k, v in JOBS.items() if v['status'] in ('completed', 'failed', 'cancelled')), None)
            if old_id is None:
                raise ValueError('Download queue is full. Finish or cancel existing downloads before adding more.')
            JOBS.pop(old_id)
        job = {
            'id': uuid.uuid4().hex[:14], 'kind': kind, 'url': url,
            'status': 'queued', 'title': 'Preparing video…', 'created': time.time(),
            'progress': 0, 'downloaded_bytes': 0, 'total_bytes': 0,
            'speed': None, 'eta': None, 'error': None, 'filename': None,
            'formats': [], 'completed_items': 0, 'total_items': None,
            'current_item': '', 'downloaded_items': 0, 'error_code': None, 'error_hint': None,
            'error_details': [], 'note': None, '_errors': [], '_saved_files': set(),
            '_finished_files': set(), 'cancel_event': threading.Event()
        }
        job.update(kwargs)
        JOBS[job['id']] = job
        return job


class JobCancelled(Exception):
    pass


def check_cancelled(job):
    if job['cancel_event'].is_set():
        raise JobCancelled('Cancelled by user')


def effective_choices(data):
    """Accept 1.1 fields so existing single-video callers still work."""
    legacy = str(data.get('quality') or 'best')
    output = str(data.get('format') or ('mp3' if legacy == 'audio' else 'mp4' if legacy == 'mp4' else 'auto'))
    resolution = str(data.get('resolution') or (legacy if legacy in RESOLUTIONS else 'best'))
    if output not in FORMATS:
        raise ValueError('Unsupported output format')
    if resolution not in RESOLUTIONS:
        raise ValueError('Unsupported resolution')
    cookies = str(data.get('cookies') or 'none')
    if cookies not in BROWSERS:
        raise ValueError('Unsupported browser choice')
    return output, resolution, cookies


ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]')


def clean_error(message):
    msg = ANSI.sub('', str(message or ''))
    msg = msg.replace('\\.', '.').replace('\\/', '/')
    msg = re.sub(r'(?i)(cookie|authorization|token)[=:]\S+', r'\1=[hidden]', msg)
    return re.sub(r'^\s*(?:ERROR:|WARNING:)\s*', '', msg, flags=re.I).strip()[:700]


def diagnose_error(message, url=''):
    raw = clean_error(message)
    lower = raw.lower()
    host = urlparse(url).hostname or 'the website'
    if re.search(r'curl:\s*\(28\)|\b(?:timed? out|time.?out|could not connect|failed to connect)\b', lower):
        return ('network_timeout', f'Could not connect to {host} (connection timed out).',
                'Open the site in your browser and check your Internet, DNS, firewall or site availability. Changing video format will not fix a connection timeout.')
    if re.search(r'\b(?:name or service not known|dns|name resolution|getaddrinfo|could not resolve host)\b', lower):
        return ('dns_error', f'Could not resolve the address for {host}.',
                'Check whether the website opens in your browser and verify your Internet/DNS connection.')
    if re.search(r'\b(?:http error 403|403 forbidden|http 403|access denied)\b', lower):
        return ('access_denied', 'The website denied the download request (HTTP 403).',
                'The video might be unavailable or require permission. Check access in your browser; restrictions are not bypassed.')
    if re.search(r'\b(?:http error 404|404 not found|unavailable video|video unavailable)\b', lower):
        return ('unavailable', 'The video or playlist item is not available.',
                'Check that the URL is correct and the video is available to you.')
    if re.search(r'\b(?:ffmpeg|postprocess|conversion)\b', lower):
        return ('conversion', 'The media downloaded but could not be processed into the requested format.',
                'Make sure FFmpeg is installed and try Best original (Auto) format.')
    if re.search(r'\b(?:unsupported url|no suitable extractor|not supported)\b', lower):
        return ('unsupported', 'This URL is not currently supported by the download engine.',
                'Try a direct video URL or update yt-dlp. Some websites do not provide downloadable streams.')
    return ('download_error', 'This download did not finish.',
            'Check that the link is reachable and available, then try again. See details below for the original error.')


class JobLogger:
    """Keep extraction failures even when yt-dlp ignoreerrors=True suppresses exceptions."""
    def __init__(self, job):
        self.job = job

    def debug(self, _message):
        pass

    def warning(self, _message):
        pass

    def error(self, message):
        msg = clean_error(message)
        if not msg:
            return
        with LOCK:
            if msg not in self.job['_errors']:
                self.job['_errors'].append(msg)
                self.job['_errors'] = self.job['_errors'][-12:]


def note_failure(job, error=None):
    with LOCK:
        details = list(job['_errors'])
    if error is not None:
        details.append(clean_error(error))
    first = next((e for e in details if e), 'The download returned no files.')
    code, summary, hint = diagnose_error(first, job.get('url', ''))
    modify(job['id'], error=summary, error_code=code, error_hint=hint,
           error_details=details[-4:])
    return bool(details)


def progress_hook(job):
    def progress(hook):
        check_cancelled(job)
        status = hook.get('status')
        info = hook.get('info_dict') or {}
        if job.get('playlist'):
            total = info.get('n_entries') or info.get('playlist_count')
            if total:
                try:
                    limit = int(job.get('playlist_limit') or 0)
                    modify(job['id'], total_items=min(int(total), limit) if limit else int(total))
                except (ValueError, TypeError):
                    pass
            if info.get('title'):
                modify(job['id'], current_item=str(info['title'])[:150])
        if status == 'downloading':
            done = hook.get('downloaded_bytes') or 0
            total_bytes = hook.get('total_bytes') or hook.get('total_bytes_estimate') or 0
            pct = min(99, 100 * done / total_bytes) if total_bytes else 0
            total_items = job.get('total_items')
            if job.get('playlist') and total_items:
                pct = min(99, 100 * (job.get('downloaded_items', 0) + pct / 100) / total_items)
            modify(job['id'], status='downloading', downloaded_bytes=done,
                   total_bytes=total_bytes, progress=round(pct, 1),
                   speed=safe_float(hook.get('speed')), eta=safe_float(hook.get('eta')))
        elif status == 'finished':
            if job.get('playlist'):
                identity = str(info.get('id') or info.get('playlist_index') or hook.get('filename'))
                with LOCK:
                    job['_finished_files'].add(identity)
                    job['downloaded_items'] = len(job['_finished_files'])
                    total = job.get('total_items')
                    job['progress'] = min(99, round(100 * job['downloaded_items'] / total, 1)) if total else 0
                    job['status'] = 'processing'
            else:
                modify(job['id'], status='processing', progress=99,
                       filename=Path(hook.get('filename') or '').name)
    return progress


def saved_file_hook(job):
    """yt-dlp post_hooks run when final download/postprocessing is finished."""
    def on_saved(filename):
        check_cancelled(job)
        path = Path(filename)
        if not path.is_file():
            return
        with LOCK:
            job['_saved_files'].add(str(path.resolve()))
            job['completed_items'] = len(job['_saved_files'])
            job['output_path'] = str(path if not job.get('playlist') else path.parent)
            job['filename'] = path.name
    return on_saved


def build_ydl_opts(job, inspect=False, playlist_preview=False):
    playlist = bool(job.get('playlist'))
    opts = {
        'noplaylist': not playlist, 'ignoreerrors': playlist,
        'no_warnings': True, 'quiet': True, 'skip_download': inspect,
        'extract_flat': 'in_playlist' if playlist_preview else False,
        'socket_timeout': 25, 'retries': 3, 'fragment_retries': 3, 'extractor_retries': 2,
        'paths': {'home': str(DOWNLOAD_DIR)},
        'outtmpl': ('Playlists/%(playlist_title|Playlist)s/%(playlist_index|0)03d - %(title).140B [%(id)s].%(ext)s'
                    if playlist and not inspect else '%(title).140B [%(id)s].%(ext)s'),
        'windowsfilenames': True, 'progress_hooks': [progress_hook(job)],
        'post_hooks': [saved_file_hook(job)], 'logger': JobLogger(job),
        'overwrites': False, 'continuedl': True,
    }
    if playlist_preview:
        opts['playlistend'] = 25  # preview only; actual download can fetch the full list
    elif playlist and job.get('playlist_limit'):
        opts['playlistend'] = int(job['playlist_limit'])
    if FFMPEG_DIR:
        opts['ffmpeg_location'] = FFMPEG_DIR
    browser = job.get('cookies')
    if browser in BROWSERS and browser != 'none':
        opts['cookiesfrombrowser'] = (browser,)
    if not inspect:
        output = job.get('format', 'auto')
        height = job.get('resolution', 'best')
        quality_filter = f'[height<={height}]' if height != 'best' else ''
        if output in ('mp3', 'm4a', 'wav', 'flac'):
            opts['format'] = 'bestaudio/best'
            opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio', 'preferredcodec': output,
                'preferredquality': '192' if output == 'mp3' else '0'
            }]
        elif output == 'mp4':
            opts['format'] = (f'bv*{quality_filter}[ext=mp4]+ba[ext=m4a]/'
                              f'b{quality_filter}[ext=mp4]/'
                              f'bv*{quality_filter}+ba/b{quality_filter}/b')
            opts['merge_output_format'] = 'mp4'
            opts['postprocessors'] = [{'key': 'FFmpegVideoConvertor', 'preferedformat': 'mp4'}]  # for non-MP4 sources
        elif output == 'webm':
            opts['format'] = (f'bv*{quality_filter}[ext=webm]+ba[ext=webm]/'
                              f'b{quality_filter}[ext=webm]/'
                              f'bv*{quality_filter}+ba/b{quality_filter}/b')
            opts['merge_output_format'] = 'webm'
            opts['postprocessors'] = [{'key': 'FFmpegVideoConvertor', 'preferedformat': 'webm'}]
        else:
            opts['format'] = f'bv*{quality_filter}+ba/b{quality_filter}/b'
            opts['merge_output_format'] = 'mkv' if output == 'mkv' else 'mp4/mkv'
            if output == 'mkv':
                opts['postprocessors'] = [{'key': 'FFmpegVideoRemuxer', 'preferedformat': 'mkv'}]
    return opts


def friendly_error(error):
    return clean_error(error)[-700:]


def analyze_job(job):
    if yt_dlp is None:
        modify(job['id'], status='failed', error='yt-dlp is not installed. Run START_WINDOWS.bat.'); return
    if job['cancel_event'].is_set():
        modify(job['id'], status='cancelled'); return
    modify(job['id'], status='analyzing')
    try:
        with yt_dlp.YoutubeDL(build_ydl_opts(job, True)) as ydl:
            info = ydl.extract_info(job['url'], download=False)
        check_cancelled(job)
        if not info:
            raise RuntimeError('Website returned no video information.')
        if info.get('entries'):
            info = next((entry for entry in info['entries'] if entry), info)
        heights = sorted({int(f['height']) for f in (info.get('formats') or [])
                          if f.get('vcodec') not in (None, 'none') and isinstance(f.get('height'), int)}, reverse=True)
        modify(job['id'], status='completed', title=str(info.get('title') or 'Video')[:200],
               duration=safe_float(info.get('duration')),
               uploader=str(info.get('uploader') or '')[:100],
               platform=str(info.get('extractor_key') or '')[:80],
               formats=heights[:15], progress=100)
    except Exception as error:
        if job['cancel_event'].is_set():
            modify(job['id'], status='cancelled', error='Cancelled by user')
        else:
            note_failure(job, error)
            modify(job['id'], status='failed')


def analyze_playlist_job(job):
    if yt_dlp is None:
        modify(job['id'], status='failed', error='yt-dlp is not installed.'); return
    modify(job['id'], status='analyzing')
    try:
        with yt_dlp.YoutubeDL(build_ydl_opts(job, inspect=True, playlist_preview=True)) as ydl:
            info = ydl.extract_info(job['url'], download=False)
        check_cancelled(job)
        if not info or info.get('_type') not in ('playlist', 'multi_video'):
            raise ValueError('This address did not return a playlist. Try Single video instead.')
        entries = [e for e in (info.get('entries') or []) if e]
        count = info.get('playlist_count') or info.get('n_entries') or None
        sample = [{'title': str(e.get('title') or 'Untitled')[:130],
                   'id': str(e.get('id') or '')[:100]} for e in entries[:12]]
        modify(job['id'], status='completed', title=str(info.get('title') or 'Playlist')[:200],
               platform=str(info.get('extractor_key') or '')[:80],
               total_items=int(count) if count is not None else None,
               preview_count=len(entries), preview_items=sample, progress=100)
    except Exception as error:
        if job['cancel_event'].is_set():
            modify(job['id'], status='cancelled', error='Cancelled by user')
        else:
            note_failure(job, error)
            modify(job['id'], status='failed')


def download_job(job):
    if yt_dlp is None:
        modify(job['id'], status='failed', error='yt-dlp is not installed. Run START_WINDOWS.bat.'); return
    if job['cancel_event'].is_set():
        modify(job['id'], status='cancelled', error='Cancelled by user'); return
    modify(job['id'], status='analyzing')
    try:
        with yt_dlp.YoutubeDL(build_ydl_opts(job)) as ydl:
            info = ydl.extract_info(job['url'], download=True)
            check_cancelled(job)
            if job.get('playlist'):
                entries = (info or {}).get('entries') or []
                if not isinstance(entries, list):
                    entries = list(entries)
                valid_entries = len([e for e in entries if e])
                count = job['completed_items']
                total = job.get('total_items') or valid_entries or None
                limit = int(job.get('playlist_limit') or 0)
                if total and limit:
                    total = min(total, limit)
                count_errors = note_failure(job) if job['_errors'] else False
                if not info or count == 0:
                    msg = ('No files were saved from this playlist. '
                           'The source may be inaccessible, empty, or the files may already exist.')
                    if not count_errors:
                        modify(job['id'], error=msg, error_code='empty_playlist',
                               error_hint='Check that you supplied a playlist URL (not a single video). Try Playlist info, and check your download folder.')
                    modify(job['id'], status='failed', progress=0, total_items=total,
                           filename='No new videos saved')
                    return
                is_playlist = info.get('_type') in ('playlist', 'multi_video')
                has_errors = bool(job['_errors'])
                partial = has_errors or (total is not None and count < total)
                outcome = 'partial' if partial else 'completed'
                msg = (f'{count} video(s) saved; some items failed or were unavailable.' if partial
                       else f'{count} video(s) saved successfully.')
                if partial and not has_errors:
                    modify(job['id'], error=f'{total-count} item(s) were not saved.',
                           error_code='incomplete_playlist',
                           error_hint='Some items may be unavailable, private or already downloaded. Check the playlist and try again.')
                if not is_playlist:
                    msg += ' This link resolved to one video, not a playlist.'
                    modify(job['id'], note='Use the actual playlist or channel URL to download a collection.')
                modify(job['id'], status=outcome, title=str(info.get('title') or 'Playlist')[:200],
                       total_items=total, progress=100 if not partial else min(99, round(100 * count / total, 1)) if total else 99,
                       filename=msg, output_path=str(DOWNLOAD_DIR / 'Playlists'))
                return
            if not info:
                note_failure(job)
                if not job.get('error'):
                    modify(job['id'], error='Website returned no downloadable video.',
                           error_code='no_video', error_hint='Check the link in your browser.')
                modify(job['id'], status='failed', progress=0)
                return
            title = str(info.get('title') or 'Video')[:200]
            possibilities = [info.get('filepath') or '']
            possibilities += [d.get('filepath') or '' for d in (info.get('requested_downloads') or [])]
            if job['format'] in ('mp3', 'm4a', 'wav', 'flac'):
                possibilities.append(str(Path(ydl.prepare_filename(info)).with_suffix('.' + job['format'])))
            possibilities.append(ydl.prepare_filename(info))
            possibilities += list(job['_saved_files'])
            actual = next((p for p in possibilities if p and Path(p).is_file()), None)
            if not actual:
                basename = Path(ydl.prepare_filename(info)).stem
                files = sorted(DOWNLOAD_DIR.glob(basename + '.*'), key=lambda p:p.stat().st_mtime, reverse=True)
                actual = str(files[0]) if files else None
            if not actual:
                note_failure(job)
                if not job.get('error'):
                    modify(job['id'], error='The transfer finished, but no completed file was found.',
                           error_code='file_missing', error_hint='Check FFmpeg and the download folder; try Best original output.')
                modify(job['id'], status='failed')
                return
            modify(job['id'], status='completed', progress=100, title=title,
                   filename=Path(actual).name, output_path=str(actual), error=None)
    except Exception as error:
        if job['cancel_event'].is_set() or isinstance(error, JobCancelled):
            modify(job['id'], status='cancelled', error='Cancelled by user', error_code='cancelled')
        else:
            note_failure(job, error)
            modify(job['id'], status='failed')


class AppHandler(BaseHTTPRequestHandler):
    server_version = 'StreamCatch/1.2.1'

    def log_message(self, *_args):
        pass  # Do not log signed URLs or page titles.

    def _origin(self):
        origin = self.headers.get('Origin', '').rstrip('/')
        return origin if origin == EXTENSION_ORIGIN else ''

    def _is_extension_request(self):
        # Backward-compatible 1.1 header preserves working auto-connect.
        origin = self.headers.get('Origin', '')
        return (origin in ('', EXTENSION_ORIGIN)
                and self.headers.get('X-StreamCatch-Client') == 'StreamCatch/1.1'
                and self.headers.get('X-StreamCatch-Extension') == EXTENSION_ORIGIN.rsplit('/', 1)[-1])

    def _write(self, code=200, payload=None):
        data = json.dumps(payload if payload is not None else {}, ensure_ascii=False, default=str).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        if self._origin():
            self.send_header('Access-Control-Allow-Origin', self._origin())
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-StreamCatch-Client, X-StreamCatch-Extension')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if not self._origin():
            self._write(403, {'error': 'Extension only'}); return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self._origin())
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-StreamCatch-Client, X-StreamCatch-Extension')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _require_client(self):
        if not self._is_extension_request():
            self._write(403, {'error': 'Open StreamCatch from the matching Chrome extension.'})
            return False
        return True

    def _read_json(self):
        try:
            size = int(self.headers.get('Content-Length') or 0)
            if size <= 0 or size > 250000:
                raise ValueError('Request too large or empty')
            value = json.loads(self.rfile.read(size))
            if not isinstance(value, dict):
                raise ValueError('Object required')
            return value
        except Exception as error:
            raise ValueError('Invalid request data') from error

    def do_GET(self):
        if not self._require_client():
            return
        if self.path == '/health':
            self._write(200, {'ok': True, 'version': '1.2.1', 'yt_dlp': yt_dlp is not None,
                              'ffmpeg': bool(FFMPEG_DIR), 'folder': str(DOWNLOAD_DIR),
                              'features': ['playlist', 'bulk', 'formats', 'auto-connect', 'side-panel']}); return
        if self.path == '/jobs':
            with LOCK:
                values = [snapshot(j) for j in JOBS.values()]
            self._write(200, {'ok': True, 'items': list(reversed(values))[:200]}); return
        if self.path == '/settings':
            self._write(200, {'ok': True, 'folder': str(DOWNLOAD_DIR),
                              'ffmpeg': bool(FFMPEG_DIR), 'yt_dlp': yt_dlp is not None}); return
        self._write(404, {'error': 'Not found'})

    def do_POST(self):
        if not self._require_client():
            return
        try:
            data = self._read_json()
        except ValueError as error:
            self._write(400, {'error': str(error)}); return
        if self.path in ('/analyze', '/playlist-info', '/download', '/bulk-download'):
            try:
                output, resolution, cookies = effective_choices(data)
                urls = data.get('urls') if self.path == '/bulk-download' else [data.get('url')]
                if not isinstance(urls, list) or not urls or len(urls) > MAX_BULK:
                    raise ValueError(f'Use 1–{MAX_BULK} URLs per batch')
                if any(not is_public_url(u) for u in urls):
                    raise ValueError('All links must be valid public http(s) URLs')
                urls = list(dict.fromkeys(u.strip() for u in urls))
                if data.get('playlist_limit', 0) not in (None, 0, '0', ''):
                    limit = int(data['playlist_limit'])
                    if limit < 1 or limit > 10000:
                        raise ValueError('Playlist limit must be 1 to 10,000')
                else:
                    limit = 0  # 0 = complete playlist; no silent limit
                playlist = bool(data.get('playlist'))
                if self.path == '/playlist-info':
                    playlist = True
                kind = 'playlist_info' if self.path == '/playlist-info' else ('analyze' if self.path == '/analyze' else 'download')
                jobs = [add_job(kind, url, format=output, resolution=resolution,
                                quality=output, cookies=cookies, playlist=playlist,
                                playlist_limit=limit) for url in urls]
            except (ValueError, TypeError, OverflowError) as error:
                self._write(400, {'error': str(error)}); return
            fn = analyze_playlist_job if kind == 'playlist_info' else analyze_job if kind == 'analyze' else download_job
            for job in jobs:
                POOL.submit(fn, job)
            self._write(202, {'ok': True, 'id': jobs[0]['id'], 'ids': [j['id'] for j in jobs], 'count': len(jobs)}); return
        if self.path == '/retry':
            old_id = str(data.get('id') or '')
            with LOCK:
                old = JOBS.get(old_id)
                if not old or old.get('kind') != 'download':
                    self._write(404, {'error': 'Download job not found'}); return
                if old['status'] not in ('failed', 'partial'):
                    self._write(400, {'error': 'Only failed or partially completed downloads may be retried'}); return
                try:
                    new = add_job('download', old['url'], format=old.get('format','auto'),
                                  resolution=old.get('resolution','best'), cookies=old.get('cookies','none'),
                                  quality=old.get('format','auto'), playlist=old.get('playlist',False),
                                  playlist_limit=old.get('playlist_limit',0))
                except ValueError as error:
                    self._write(409, {'error': str(error)}); return
            POOL.submit(download_job, new)
            self._write(202, {'ok': True, 'id': new['id']}); return
        if self.path == '/cancel':
            job_id = str(data.get('id') or '')
            with LOCK:
                job = JOBS.get(job_id)
                if not job:
                    self._write(404, {'error': 'Job not found'}); return
                if job['status'] in ('queued', 'analyzing', 'downloading', 'processing'):
                    job['cancel_event'].set()
                    if job['status'] == 'queued':
                        job['status'] = 'cancelled'
            self._write(200, {'ok': True}); return
        if self.path == '/clear-completed':
            with LOCK:
                ids = [k for k, job in JOBS.items() if job['status'] in ('completed', 'failed', 'partial', 'cancelled')]
                for key in ids:
                    JOBS.pop(key, None)
            self._write(200, {'ok': True, 'count': len(ids)}); return
        if self.path == '/open-folder':
            try:
                if sys.platform == 'win32':
                    os.startfile(str(DOWNLOAD_DIR))
                else:
                    import subprocess
                    subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(DOWNLOAD_DIR)])
            except Exception as error:
                self._write(500, {'error': friendly_error(error)}); return
            self._write(200, {'ok': True}); return
        self._write(404, {'error': 'Not found'})


def main():
    parser = argparse.ArgumentParser(description='StreamCatch companion downloader')
    parser.add_argument('--port', type=int, default=8735)
    args = parser.parse_args()
    try:
        httpd = ThreadingHTTPServer(('127.0.0.1', args.port), AppHandler)
    except OSError as error:
        print('\n[StreamCatch] SERVER DID NOT START:', error, file=sys.stderr)
        print('Port 8735 may still belong to an older helper. Close it and start this one.', file=sys.stderr)
        sys.exit(1)
    try:
        print('\n' + '=' * 65)
        print('  STREAMCATCH v1.2.1  /  LOCAL DOWNLOAD ENGINE')
        print('=' * 65)
        print('  STATUS:     SERVER RUNNING - AUTO CONNECT ENABLED')
        print('  Address:    http://127.0.0.1:' + str(args.port))
        print('  Pairing:    NOT REQUIRED')
        print('  Features:   PLAYLISTS / BULK DOWNLOADS / EXTRA FORMATS')
        print('  Downloads:  ' + str(DOWNLOAD_DIR))
        print('  yt-dlp:     ' + ('READY' if yt_dlp else 'NOT INSTALLED'))
        print('  FFmpeg:     ' + ('READY' if FFMPEG_DIR else 'MISSING'))
        print('  Ctrl+C stops the helper.')
        print('=' * 65 + '\n', flush=True)
        httpd.serve_forever(poll_interval=.5)
    except KeyboardInterrupt:
        print('\nStopping StreamCatch…')
    finally:
        httpd.server_close()
        POOL.shutdown(wait=False, cancel_futures=True)


if __name__ == '__main__':
    main()
