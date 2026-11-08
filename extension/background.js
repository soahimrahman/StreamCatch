// StreamCatch: no cookie access, request bodies, or headers are collected.
'use strict';
const CACHE_LIMIT = 60;
const mediaCache = new Map();
const DIRECT_EXT = /\.(mp4|m4v|webm|mov|mkv|avi|flv)(?:$|[?#])/i;
const HLS_EXT = /\.m3u8(?:$|[?#])/i;
const DASH_EXT = /\.mpd(?:$|[?#])/i;
const FRAG_EXT = /\.(?:m4s|ts|cmfv|cmfa|aac|m4a)(?:$|[?#])/i;
const isUrl = value => typeof value === 'string' && /^https?:\/\//i.test(value);

const GITHUB_RAW_PACKAGE = 'https://raw.githubusercontent.com/soahimrahman/StreamCatch/main/package.json';
const GITHUB_RELEASES_URL = 'https://github.com/soahimrahman/StreamCatch/releases';

function parseSemver(v) {
  const clean = String(v || '').replace(/^[^\d]*/, '').trim();
  const [core, prerelease] = clean.split('-');
  const parts = core.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return { major: parts[0], minor: parts[1], patch: parts[2], prerelease: prerelease || '' };
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && !pb.prerelease) return -1;
  return 0;
}

async function checkForUpdates(force = false) {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const res = await fetch(`${GITHUB_RAW_PACKAGE}?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const remoteVersion = data.version;

    if (remoteVersion && compareSemver(remoteVersion, currentVersion) > 0) {
      const updateData = {
        available: true,
        currentVersion,
        latestVersion: remoteVersion,
        releaseUrl: GITHUB_RELEASES_URL,
        checkedAt: Date.now()
      };
      await chrome.storage.local.set({ updateAvailable: updateData });
      try {
        await chrome.action.setBadgeText({ text: 'NEW' });
        await chrome.action.setBadgeBackgroundColor({ color: '#7157e9' });
      } catch {}
      return updateData;
    } else {
      const updateData = {
        available: false,
        currentVersion,
        latestVersion: remoteVersion || currentVersion,
        releaseUrl: GITHUB_RELEASES_URL,
        checkedAt: Date.now()
      };
      await chrome.storage.local.set({ updateAvailable: updateData });
      try {
        const curBadge = await chrome.action.getBadgeText({});
        if (curBadge === 'NEW') {
          await chrome.action.setBadgeText({ text: '' });
        }
      } catch {}
      return updateData;
    }
  } catch (err) {
    console.warn('StreamCatch update check failed:', err);
    return { available: false, error: err.message };
  }
}

function classify(url, mime = '') {
  if (!isUrl(url) || FRAG_EXT.test(url)) return null;
  const ct = String(mime).toLowerCase().split(';')[0].trim();
  if (HLS_EXT.test(url) || /mpegurl|vnd\.apple\.mpegurl/i.test(ct)) return 'hls';
  if (DASH_EXT.test(url) || /dash\+xml/i.test(ct)) return 'dash';
  if (DIRECT_EXT.test(url) || (/^video\//.test(ct) && !/mp2t/.test(ct))) return 'direct';
  return null;
}
function trimmedText(text, max=200) { return String(text || '').replace(/[\r\n\t]+/g, ' ').slice(0, max); }
function cleanTitle(title) {return trimmedText(title || 'Video', 90).replace(/[\\/:*?"<>|]+/g,' ').trim() || 'Video';}
function labelFor(url, type) {
  try {
    const path = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return path && path.length < 65 && /\.[a-z\d]{2,5}$/i.test(path) ? trimmedText(path,65) : `${type.toUpperCase()} media`;
  } catch {return `${type.toUpperCase()} media`;}
}
async function getMedia(tabId) {
  if (mediaCache.has(tabId)) return mediaCache.get(tabId);
  let entries=[];
  try {const saved=await chrome.storage.session.get(`media_${tabId}`); entries=saved[`media_${tabId}`] || [];} catch {}
  mediaCache.set(tabId, entries);
  return entries;
}
async function updateBadge(tabId, count) {
  try {
    if (count > 0) {
      await chrome.action.setBadgeText({tabId, text: String(Math.min(count, 99))});
      await chrome.action.setBadgeBackgroundColor({tabId, color: '#19caaa'});
    } else {
      const { updateAvailable } = await chrome.storage.local.get('updateAvailable');
      if (updateAvailable?.available) {
        await chrome.action.setBadgeText({tabId, text: 'NEW'});
        await chrome.action.setBadgeBackgroundColor({tabId, color: '#7157e9'});
      } else {
        await chrome.action.setBadgeText({tabId, text: ''});
      }
    }
  } catch {}
}
async function capture(tabId, url, type, extra={}) {
  if (!Number.isInteger(tabId) || tabId < 0 || !type || !isUrl(url)) return;
  const settings=await chrome.storage.local.get('captureEnabled');
  if (settings.captureEnabled === false) return;
  // Avoid misleading people with segmented Google video/audio fragments.
  const host = new URL(url).hostname;
  if (/\bgooglevideo\.com$/i.test(host)) return;
  const list = await getMedia(tabId);
  const existing=list.find(e=>e.url===url);
  if (existing) {
    if (extra.size && !existing.size) existing.size=extra.size;
    if (extra.mime && !existing.mime) existing.mime=extra.mime;
    await chrome.storage.session.set({[`media_${tabId}`]:list}).catch(()=>{});
    return;
  }
  list.unshift({id:`${Date.now()}-${Math.random().toString(16).slice(2,9)}`,url,type,
    label:trimmedText(extra.label || labelFor(url,type),110),
    mime:trimmedText(extra.mime || '',85), size:Number(extra.size)||0,
    source:extra.source === 'page' ? 'Page player' : 'Network', seen:Date.now()});
  list.length=Math.min(list.length,CACHE_LIMIT);
  mediaCache.set(tabId,list);
  await chrome.storage.session.set({[`media_${tabId}`]:list}).catch(()=>{});
  await updateBadge(tabId,list.length);
}
async function clearMedia(tabId) {
  mediaCache.delete(tabId);
  await chrome.storage.session.remove(`media_${tabId}`).catch(()=>{});
  await updateBadge(tabId,0);
}
chrome.webRequest.onHeadersReceived.addListener(details=>{
  try {
    const mime=details.responseHeaders?.find(h=>h.name?.toLowerCase()==='content-type')?.value||'';
    const size=Number(details.responseHeaders?.find(h=>h.name?.toLowerCase()==='content-length')?.value||0);
    const type=classify(details.url,mime);
    if (type && details.statusCode>=200 && details.statusCode<400) {
      capture(details.tabId,details.url,type,{mime,size,source:'network'}).catch(()=>{});
    }
  } catch {}
}, {urls:['<all_urls>']}, ['responseHeaders']);
chrome.runtime.onMessage.addListener((message, sender, respond)=>{
  (async()=>{
    switch(message?.action){
      case 'MEDIA_FROM_PAGE': {
        if (sender.tab?.id === undefined) return {ok:false};
        const items=Array.isArray(message.items)?message.items.slice(0,35):[];
        for (const m of items) {
          const type=classify(m.url,m.mime)||null;
          if (type) await capture(sender.tab.id,m.url,type,{mime:m.mime,label:m.label,source:'page'});
        }
        return {ok:true};
      }
      case 'GET_MEDIA': return {ok:true, items:await getMedia(Number(message.tabId))};
      case 'CLEAR_MEDIA': await clearMedia(Number(message.tabId)); return {ok:true};
      case 'DOWNLOAD_DIRECT': {
        const url=message.url;
        if (!isUrl(url)) throw Error('Invalid download URL.');
        if (!message.direct && classify(url) !== 'direct') throw Error('Not a direct video link. Use the local engine for streams or page URLs.');
        let ext=message.ext;
        if (!ext) {
          const match=new URL(url).pathname.match(/\.(mp4|m4v|webm|mov|mkv|avi|flv|mp3|m4a|wav|flac)$/i);
          ext=match?match[1]:'mp4';
        }
        const title=cleanTitle(message.title || 'Video');
        const filename=`StreamCatch/${title}.${ext.toLowerCase()}`;
        const id=await chrome.downloads.download({url,filename,conflictAction:'uniquify',saveAs:false});
        const stored=await chrome.storage.local.get('directHistory');
        const history=Array.isArray(stored.directHistory)?stored.directHistory:[];
        history.unshift({id,urlHost:new URL(url).hostname,title,status:'in_progress',time:Date.now()});
        await chrome.storage.local.set({directHistory:history.slice(0,50)});
        return {ok:true,id};
      }
      case 'GET_DIRECT_DOWNLOADS': {
        const {directHistory=[]}=await chrome.storage.local.get('directHistory');
        const ids=directHistory.map(e=>e.id).filter(Number.isInteger);
        const all=await chrome.downloads.search({limit:200,orderBy:['-startTime']});
        return {ok:true,items:directHistory.map(h=>{
          const d=all.find(a=>a.id===h.id);
          return {...h, status:d?.state || h.status, bytes:d?.bytesReceived || 0, total:d?.totalBytes || 0, file:d?.filename || '', error:d?.error||''};
        })};
      }
      case 'CHECK_FOR_UPDATES': {
        const update = await checkForUpdates(true);
        return {ok:true, update};
      }
      case 'RELOAD_EXTENSION': {
        setTimeout(() => chrome.runtime.reload(), 100);
        return {ok:true};
      }
      default: return {ok:false,error:'Unknown action'};
    }
  })().then(respond).catch(error=>respond({ok:false,error:error?.message||String(error)}));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, changes)=>{
  if (changes.url) clearMedia(tabId).catch(()=>{});
});
chrome.tabs.onRemoved.addListener(tabId=>clearMedia(tabId).catch(()=>{}));
chrome.downloads.onChanged.addListener(async delta=>{
  if (!delta.state && !delta.error) return;
  try {
    const {directHistory=[]}=await chrome.storage.local.get('directHistory');
    const match=directHistory.find(e=>e.id===delta.id);
    if (match) {
      if(delta.state) match.status=delta.state.current;
      if(delta.error) {match.status='interrupted'; match.error=delta.error.current;}
      await chrome.storage.local.set({directHistory});
    }
  } catch {}
});

// Periodic GitHub update checks (every 4 hours)
try {
  chrome.alarms?.create('streamcatch-check-update', { periodInMinutes: 240 });
  chrome.alarms?.onAlarm?.addListener(alarm => {
    if (alarm.name === 'streamcatch-check-update') {
      checkForUpdates().catch(() => {});
    }
  });
} catch {}

chrome.runtime.onInstalled?.addListener(() => {
  checkForUpdates().catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  checkForUpdates().catch(() => {});
});
