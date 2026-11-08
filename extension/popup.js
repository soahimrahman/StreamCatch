'use strict';
const $ = id => document.getElementById(id);
const HOST = 'http://127.0.0.1:8735';
const FORMATS = ['auto','mp4','mkv','webm','mp3','m4a','wav','flac'];
const RESOLUTIONS = ['best','2160','1440','1080','720','480','360'];
const state = {
  route:'home', format:'auto', resolution:'best', downloadMode:'single',
  downloadProvider:'engine', cookieBrowser:'none', engineOnline:false, engineError:null,
  activeTab:null, tabMedia:[], jobs:[], direct:[], analyzeId:null,
  toastTimer:null, activeRequest:false, previousTabId:null, lastUserAction:Date.now()
};
['pointerdown','keydown','wheel','touchstart'].forEach(evt=>{
  window.addEventListener(evt,()=>{state.lastUserAction=Date.now();},{passive:true});
});
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shorten=(v,n=75)=>String(v||'').length>n?String(v).slice(0,n-1)+'…':String(v||'');
const isWebUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!!u.hostname;}catch{return false;}};
const looksLikePlaylist=value=>{try{const p=new URL(value).pathname.toLowerCase();return /\/playlist(?:\/|$)|\/sets\/|\/collections\/|\/channels?\/[^/]+\/videos(?:\/|$)|\/@[^/]+\/videos(?:\/|$)/.test(p);}catch{return false;}};
const originLabel=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'Website';}};
const fileSize=size=>{if(!size||!isFinite(size))return 'Size unknown';const units=['B','KB','MB','GB','TB'];let n=Number(size),i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${units[i]}`;};
const niceTime=t=>t?new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
const labelFormat=f=>({auto:'Best available',mp4:'MP4 video',mkv:'MKV video',webm:'WebM video',mp3:'MP3 audio',m4a:'M4A audio',wav:'WAV audio',flac:'FLAC audio'})[f]||'Video';
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function navigate(route){
  if(!['home','bulk','detected','downloads','settings'].includes(route))return;
  state.route=route;
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.route===route));
  document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===`view-${route}`));
  $('routeCrumb').textContent={home:'Download',bulk:'Bulk download',detected:'Detected media',downloads:'Activity',settings:'Settings'}[route];
  if(route==='detected')refreshMedia();
  if(route==='downloads')refreshActivity();
  if(route==='settings')checkEngine(false).then(showConnectionResult);
}
function setEngine(online,info={}){
  state.engineOnline=online;
  $('engineStatus').classList.toggle('online',online);$('engineStatus').classList.toggle('offline',!online);
  $('engineStatus').lastElementChild.textContent=online?'Engine online':'Engine offline';
  $('sideConnection').classList.toggle('online',online);$('sideConnection').classList.toggle('offline',!online);
  $('sideConnectionText').textContent=online?'Engine connected':'Engine disconnected';
  $('engineCardTitle').textContent=online?'Ready to download':'Engine not connected';
  $('engineCardMessage').textContent=online?'Your downloads are processed locally on this computer.':'Start the engine directly below or use SETUP_AUTO_START_WINDOWS.bat.';
  $('engineCardAction').dataset.route=online?'downloads':'settings';
  $('engineCardAction').textContent=online?'View download activity →':'Connection settings →';
  if(info.folder)$('enginePath').textContent='Downloads: '+info.folder;

  const startBtns = [$('startEngineTopBtn'), $('startEngineHomeBtn'), $('startEngineSettingsBtn'), $('startEngineSidebarBtn')];
  startBtns.forEach(btn => {
    if (btn) btn.style.display = online ? 'none' : (btn.id === 'startEngineTopBtn' ? 'flex' : 'block');
  });
}
let isStartingEngine = false;
async function startEngineProcess(){
  if(isStartingEngine || state.engineOnline) return;
  isStartingEngine = true;
  state.lastUserAction = Date.now();
  toast('Starting StreamCatch engine in the background...');

  const startBtns = [$('startEngineTopBtn'), $('startEngineHomeBtn'), $('startEngineSettingsBtn'), $('startEngineSidebarBtn')];
  startBtns.forEach(b => { if(b) b.textContent = '⏳ Starting...'; });

  // 1. Try Native Messaging (Zero browser prompts)
  try {
    if (chrome.runtime?.sendNativeMessage) {
      chrome.runtime.sendNativeMessage('com.streamcatch.engine', { action: 'start' }, () => {
        if (chrome.runtime.lastError) {
          // Native messaging not configured yet
        }
      });
    }
  } catch(e) {}

  // 2. Try custom protocol fallback (streamcatch://start)
  try {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = 'streamcatch://start';
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 2500);
  } catch(e) {}

  // 3. Fast poll until online
  let attempts = 0;
  const pollInterval = setInterval(async () => {
    attempts++;
    const ok = await checkEngine(false);
    if (ok) {
      clearInterval(pollInterval);
      isStartingEngine = false;
      showConnectionResult(true);
      toast('🚀 StreamCatch engine connected and ready!');
      startBtns.forEach(b => { if(b) b.textContent = '🚀 Start Engine'; });
      return;
    }
    if (attempts >= 14) { // ~7 seconds
      clearInterval(pollInterval);
      isStartingEngine = false;
      startBtns.forEach(b => { if(b) b.textContent = '🚀 Start Engine'; });
      toast('Engine not started. Double-click SETUP_AUTO_START_WINDOWS.bat once to configure.');
    }
  }, 500);
}
async function api(path,method='GET',body=null){
  const controller=new AbortController();const tid=setTimeout(()=>controller.abort(),18000);
  const isUserActive=(Date.now()-(state.lastUserAction||0))<300000;
  try{
    const result=await fetch(HOST+path,{method,
      headers:{
        'X-StreamCatch-Client':'StreamCatch/1.1',
        'X-StreamCatch-Extension':chrome.runtime.id,
        'X-StreamCatch-User-Active':isUserActive?'true':'false',
        'Content-Type':'application/json'
      },
      body:body===null?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
    let json={};try{json=await result.json();}catch{}
    if(!result.ok){const e=new Error(json.error||`Engine HTTP ${result.status}`);e.status=result.status;throw e;}
    return json;
  }finally{clearTimeout(tid);}
}
function engineErrorMessage(error){
  if(error.status===403)return 'The helper rejected this extension. Run the updated v1.2.1 helper and reload StreamCatch.';
  if(error.name==='AbortError')return 'The helper took too long to respond. Restart START_STREAMCATCH_WINDOWS.bat.';
  if(error instanceof TypeError)return 'Cannot reach localhost:8735. Start the v1.2.1 Windows helper.';
  return String(error.message||error);
}
function showConnectionResult(ok){
  $('pairResult').className='result-line '+(ok?'good':'bad');
  $('pairResult').textContent=ok?'✓ Connected automatically. Ready to download.':'✕ '+(state.engineError||'Engine offline');
}
async function checkEngine(notify=false){
  try{
    const info=await api('/health');
    if(info.version!=='1.2.1')throw Error(`The helper is version ${info.version||'unknown'}. Close it and run the new v1.2.1 helper.`);
    state.engineError=null;setEngine(true,info);
    if(notify)toast(!info.ffmpeg?'Connected, but FFmpeg is missing. Run START_WINDOWS.bat.':'Local engine connected.');
    return true;
  }catch(error){state.engineError=engineErrorMessage(error);setEngine(false);if(notify)toast(shorten(state.engineError,130));return false;}
}
async function findSourceTab(){
  const tabs=await chrome.tabs.query({currentWindow:true});
  const active=tabs.find(tab=>tab.active);
  if(active&&isWebUrl(active.url))return active;
  return tabs.filter(tab=>isWebUrl(tab.url)).sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0]||null;
}
async function loadTab(refreshLink=false){
  try{
    const tab=await findSourceTab(),changed=tab?.id!==state.previousTabId;
    state.previousTabId=tab?.id;state.activeTab=tab;
    $('currentTabTitle').textContent=tab?.title||'Open a video website';
    $('currentTabHost').textContent=tab?.url?originLabel(tab.url):'YouTube, Facebook, TikTok and others';
    const host=originLabel(tab?.url||'');
    $('platformIcon').textContent=/youtube|youtu\.be/.test(host)?'▶':/facebook|fb\.watch/.test(host)?'f':/instagram/.test(host)?'◎':/tiktok/.test(host)?'♪':'▶';
    if(tab?.url&&(refreshLink||(!$('urlInput').value&&state.route==='home')))$('urlInput').value=tab.url;
    if(changed)await refreshMedia();
  }catch(error){$('currentTabTitle').textContent='Open a video page to get started';}
}
async function refreshMedia(){
  if(!state.activeTab?.id){state.tabMedia=[];renderMedia();return;}
  try{const result=await chrome.runtime.sendMessage({action:'GET_MEDIA',tabId:state.activeTab.id});state.tabMedia=result.items||[];}catch{state.tabMedia=[];}
  renderMedia();
}
function renderMedia(){
  const items=state.tabMedia;
  $('mediaCount').textContent=items.length;
  $('detectedSummary').textContent=`${items.length} FILE${items.length===1?'':'S'}`;
  $('mediaList').innerHTML=items.length?items.map((m,index)=>`<article class="file-card"><div class="file-icon">${m.type==='hls'?'≋':m.type==='dash'?'▤':'▶'}</div><div class="file-details"><strong title="${esc(m.label)}">${esc(shorten(m.label,65))}</strong><p>${esc(originLabel(m.url))} · ${esc(String(m.type).toUpperCase())} · ${esc(fileSize(m.size))}</p></div><div class="file-actions"><button class="mini-btn" data-media-download="${index}">↓ Download</button><button class="mini-btn secondary" title="Copy URL" data-media-copy="${index}">⧉</button></div></article>`).join(''):
    `<div class="empty-state"><div class="empty-icon">◈</div><strong>No video files found yet</strong><p>Play a video or reload its page. For YouTube and Facebook, use Download with the page link.</p></div>`;
}
function updateMode(mode,save=true){
  state.downloadMode=mode==='playlist'?'playlist':'single';
  document.querySelectorAll('[data-download-mode]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.downloadMode===state.downloadMode));
  $('playlistOptions').classList.toggle('hidden',state.downloadMode!=='playlist');
  $('modeHint').textContent=state.downloadMode==='playlist'?'Downloads every accessible video in a playlist or collection. This may take time.':'Downloads only one video from the link, even when the video belongs to a playlist.';
  $('inspectButton').textContent=state.downloadMode==='playlist'?'⌕ Playlist info':'⌕ Preview';
  if(save)chrome.storage.local.set({downloadMode:state.downloadMode}).catch(()=>{});
}
function updateProvider(provider,save=true){
  state.downloadProvider=provider==='browser'?'browser':'engine';
  document.querySelectorAll('[data-download-provider]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.downloadProvider===state.downloadProvider));
  const select=$('defaultProviderSelect');
  if(select)select.value=state.downloadProvider;
  const hint=$('providerHint');
  if(hint){
    hint.textContent=state.downloadProvider==='browser'
      ?'🌐 Browser Downloader: Chrome native download manager. Appears in Chrome\'s download bar and history.'
      :'⚡ Local Engine: 4K video + audio merging, MP3 conversion, full playlist support. Saved to Downloads/StreamCatch.';
  }
  if(save)chrome.storage.local.set({downloadProvider:state.downloadProvider}).catch(()=>{});
}
function syncFormats(value,save=true){
  if(!FORMATS.includes(value))return;
  state.format=value;
  for(const id of ['formatSelect','bulkFormatSelect'])$(id).value=value;
  const audio=['mp3','m4a','wav','flac'].includes(value);
  for(const id of ['resolutionSelect','bulkResolutionSelect'])$(id).disabled=audio;
  if(save)chrome.storage.local.set({format:value}).catch(()=>{});
}
function syncResolution(value,save=true){
  if(!RESOLUTIONS.includes(value))return;
  state.resolution=value;
  for(const id of ['resolutionSelect','bulkResolutionSelect'])$(id).value=value;
  if(save)chrome.storage.local.set({resolution:value}).catch(()=>{});
}
async function ensureOnline(){
  if(state.engineOnline)return true;
  if(await checkEngine())return true;
  toast('Start the v1.2.1 local helper, then reconnect.');navigate('settings');return false;
}
async function downloadUrl(url=undefined,forceSingle=false){
  const link=(url||$('urlInput').value||'').trim();
  if(!isWebUrl(link)){toast('Enter a valid video or playlist link.');return;}
  if(!forceSingle&&state.downloadMode==='single'&&looksLikePlaylist(link)){
    updateMode('playlist');toast('Playlist URL detected. Review the playlist range, then click Download now again.');return;
  }

  // Handle Browser Native Downloader option
  if(state.downloadProvider==='browser'){
    if(!forceSingle&&state.downloadMode==='playlist'){
      toast('Full playlists require Local Engine for multi-file queuing. Switching to Local Engine…');
      updateProvider('engine');
    } else {
      const isDirectFile = /\.(mp4|m4v|webm|mov|mkv|avi|flv|mp3|m4a|wav|flac)(?:[?#]|$)/i.test(link);
      const isSegmented = /\.(m3u8|mpd)(?:[?#]|$)/i.test(link);
      if(isSegmented){
        toast('Segmented streams (HLS/DASH) require Local Engine with FFmpeg to merge segments into a video file.');
        updateProvider('engine');
      } else if(isDirectFile){
        // Direct media links can start immediately via Chrome's native downloader
        $('downloadButton').disabled=true;
        try{
          const title=state.activeTab?.title||'Video';
          const res=await chrome.runtime.sendMessage({
            action:'DOWNLOAD_DIRECT',
            url:link,
            title,
            direct:true
          });
          if(!res?.ok)throw Error(res?.error||'Browser download failed');
          toast('Download started in Chrome.');
          navigate('downloads');
          await refreshActivity();
        }catch(err){
          toast('Browser download error: '+shorten(err.message,100));
        }finally{
          $('downloadButton').disabled=false;
        }
        return;
      } else {
        // Web video page (YouTube, Facebook, Twitter, TikTok, etc.)
        // Extract direct streaming URL from helper, then hand off to Chrome downloader!
        if(!await ensureOnline())return;
        $('downloadButton').disabled=true;
        try{
          toast('Extracting stream for browser…');
          const streamInfo=await api('/extract-direct-url','POST',{
            url:link,
            format:state.format,
            resolution:state.resolution,
            cookies:state.cookieBrowser
          });
          if(!streamInfo?.url)throw Error(streamInfo?.error||'No stream URL returned');
          const res=await chrome.runtime.sendMessage({
            action:'DOWNLOAD_DIRECT',
            url:streamInfo.url,
            title:streamInfo.title||state.activeTab?.title||'Video',
            ext:streamInfo.ext||'mp4',
            direct:true
          });
          if(!res?.ok)throw Error(res?.error||'Chrome download failed');
          toast('Download started in Chrome browser.');
          navigate('downloads');
          await refreshActivity();
        }catch(error){
          toast('Browser download error: '+shorten(error.message,110));
        }finally{
          $('downloadButton').disabled=false;
        }
        return;
      }
    }
  }

  // Local Engine download workflow
  if(!await ensureOnline())return;
  $('downloadButton').disabled=true;
  try{
    const playlist=!forceSingle&&state.downloadMode==='playlist';
    await api('/download','POST',{url:link,format:state.format,resolution:state.resolution,
      cookies:state.cookieBrowser,playlist,playlist_limit:playlist?Number($('playlistLimit').value):0});
    toast(playlist?'Playlist added to download queue.':'Video added to download queue.');
    navigate('downloads');await refreshActivity();
  }catch(error){toast('Download error: '+shorten(error.message,110));}
  finally{$('downloadButton').disabled=false;}
}
async function inspectUrl(){
  const link=$('urlInput').value.trim();
  if(!isWebUrl(link)){toast('Enter a valid URL first.');return;}
  if(!await ensureOnline())return;
  $('inspectButton').disabled=true;
  try{
    const playlist=state.downloadMode==='playlist';
    const response=await api(playlist?'/playlist-info':'/analyze','POST',{url:link,cookies:state.cookieBrowser});
    state.analyzeId=response.id;
    $('inspected').classList.remove('hidden');
    $('inspected').innerHTML=`<strong>Checking ${playlist?'playlist':'video'}…</strong><p>The local engine is reading information from the website.</p>`;
  }catch(error){toast('Preview failed: '+shorten(error.message,105));}
  finally{$('inspectButton').disabled=false;}
}
function renderInspect(){
  if(!state.analyzeId)return;
  const job=state.jobs.find(j=>j.id===state.analyzeId);
  if(!job)return;
  const panel=$('inspected');panel.classList.remove('hidden');
  if(job.status==='completed'){
    if(job.kind==='playlist_info'){
      const count=job.total_items?`${job.total_items} total videos`:`At least ${job.preview_count||0} videos`; 
      panel.innerHTML=`<strong>${esc(shorten(job.title,90))}</strong><p>${esc(count)} · Previewing up to 25 entries. Download mode will use your playlist range.</p><ul>${(job.preview_items||[]).map((m,i)=>`<li>${i+1}. ${esc(m.title)}</li>`).join('')}</ul>`;
    }else{
      panel.innerHTML=`<strong>${esc(shorten(job.title,100))}</strong><p>${esc(job.platform||'Video')} · ${job.duration?Math.floor(job.duration/60)+'m '+Math.round(job.duration%60)+'s':''}<br>Available resolutions: ${job.formats?.length?job.formats.map(v=>esc(v)+'p').join(', '):'Best available'}</p>`;
    }
  }else if(job.status==='failed'){panel.innerHTML=`<strong>Preview failed</strong><p>${esc(job.error||'Unknown error')}</p>`;}
  else panel.innerHTML=`<strong>Reading source…</strong><p>Checking available formats and metadata.</p>`;
}
function parseBulk(){
  const lines=$('bulkInput').value.split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean);
  const valid=[...new Set(lines.filter(isWebUrl))];
  const invalid=lines.length-valid.length-(lines.filter(isWebUrl).length-valid.length);
  return {valid,invalid,duplicates:lines.filter(isWebUrl).length-valid.length};
}
function renderBulkCount(){
  const {valid,invalid,duplicates}=parseBulk();
  $('bulkCount').textContent=`${valid.length} valid link${valid.length===1?'':'s'}${duplicates?' · '+duplicates+' duplicate'+(duplicates===1?'':'s'):''}${invalid?' · '+invalid+' invalid':''}${valid.length>100?' · max 100 at once':''}`;
}
async function bulkDownload(){
  const {valid,invalid}=parseBulk();
  if(!valid.length){toast('Paste at least one valid URL.');return;}
  if(valid.length>100){toast('Maximum 100 URLs per batch. Split your list and submit the next batch.');return;}
  if(!await ensureOnline())return;
  $('bulkDownload').disabled=true;
  try{
    const result=await api('/bulk-download','POST',{urls:valid,format:state.format,
      resolution:state.resolution,cookies:state.cookieBrowser,playlist:$('bulkPlaylists').checked});
    toast(`Added ${result.count} downloads to the queue${invalid?' · skipped '+invalid+' invalid link(s)':''}.`);
    $('bulkInput').value='';renderBulkCount();navigate('downloads');await refreshActivity();
  }catch(error){toast('Batch failed: '+shorten(error.message,110));}
  finally{$('bulkDownload').disabled=false;}
}
async function useOpenTabs(){
  try{
    const tabs=await chrome.tabs.query({currentWindow:true});
    const urls=tabs.filter(t=>isWebUrl(t.url)).map(t=>t.url).filter(u=>!u.startsWith('http://127.0.0.1:'));
    const current=parseBulk().valid;const result=[...new Set([...current,...urls])];
    $('bulkInput').value=result.join('\n');renderBulkCount();toast(`Collected ${result.length} unique links from open tabs.`);
  }catch(error){toast('Unable to read open tabs.');}
}
async function refreshActivity(){
  if(state.engineOnline){
    try{const data=await api('/jobs');state.jobs=data.items||[];}catch{state.jobs=[];setEngine(false);}
  }else state.jobs=[];
  try{const result=await chrome.runtime.sendMessage({action:'GET_DIRECT_DOWNLOADS'});state.direct=result.items||[];}catch{state.direct=[];}
  renderJobs();renderDirect();renderInspect();
}
function renderJobs(){
  const jobs=state.jobs.filter(j=>j.kind==='download');
  $('activeCount').textContent=jobs.filter(j=>['analyzing','downloading','processing'].includes(j.status)).length;
  $('completedCount').textContent=jobs.filter(j=>['completed','partial'].includes(j.status)).length;
  $('queuedCount').textContent=jobs.filter(j=>j.status==='queued').length;
  $('jobsList').innerHTML=jobs.length?jobs.map(j=>{
    const p=Math.min(100,Math.max(0,Number(j.progress)||0));
    const done=['completed','failed','partial','cancelled'].includes(j.status);
    const speed=j.speed?fileSize(j.speed)+'/s':'';
    const name=j.title==='Preparing video…'?originLabel(j.url):j.title;
    const title=j.playlist?`▤ ${name}`:name;
    const parts=[originLabel(j.url),labelFormat(j.format||j.quality),j.playlist?'Playlist':'Single video'];
    const current=j.playlist&&j.current_item?` · ${shorten(j.current_item,36)}`:'';
    const count=j.playlist&&j.total_items?`${j.completed_items||0}/${j.total_items} videos${current}`:j.playlist&&j.completed_items?`${j.completed_items} videos${current}`:'';
    const meta=['completed','partial'].includes(j.status)?j.filename||'Saved':count||(speed?(speed+(j.eta?' · '+Math.round(j.eta)+'s left':'')):niceTime(j.created*1000));
    return `<article class="job-card"><div class="job-top"><div class="job-icon">${j.playlist?'▤':['mp3','m4a','wav','flac'].includes(j.format)?'♫':'↓'}</div><div class="job-details"><strong title="${esc(name)}">${esc(shorten(title,90))}</strong><p>${esc(parts.join(' · '))}</p></div><span class="job-state ${esc(j.status)}">${esc(j.status)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div><div class="job-footer"><span class="job-meta" title="${esc(j.output_path||'')}">${esc(shorten(meta,90))}</span><span>${p?p.toFixed(0)+'%':''} ${!done?`<button data-cancel-job="${esc(j.id)}">Cancel</button>`:(['failed','partial'].includes(j.status)?`<button data-retry-job="${esc(j.id)}" title="Retry this download">↻ Retry</button>`:'')} <button data-open-source="${esc(j.id)}" title="Open original page">↗ Open page</button></span></div>${j.error?`<div class="job-error-block"><p class="job-details job-error">${esc(j.error)}</p>${j.error_hint?`<p class="job-fix-hint">${esc(j.error_hint)}</p>`:''}${j.error_details?.length?`<details class="job-details-toggle"><summary>Technical details</summary><p>${esc(j.error_details.join(' | ').slice(0,850))}</p></details>`:''}</div>`:''}${j.note?`<p class="job-fix-hint">${esc(j.note)}</p>`:''}</article>`;
  }).join(''):
    `<div class="empty-state"><div class="empty-icon">↓</div><strong>Your queue is empty</strong><p>Start a download or paste multiple URLs from the Bulk tab. Active transfers appear here.</p></div>`;
}
function renderDirect(){
  $('directList').innerHTML=state.direct.length?state.direct.slice(0,20).map(d=>{
    const p=d.total?Math.min(100,100*d.bytes/d.total):0;
    return `<article class="job-card"><div class="job-top"><div class="job-icon">◈</div><div class="job-details"><strong>${esc(shorten(d.title,80))}</strong><p>${esc(d.urlHost||'Direct media')} · ${esc(niceTime(d.time))}</p></div><span class="job-state ${esc(d.status)}">${esc(d.status)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div><div class="job-footer"><span class="job-meta">${esc(d.error||fileSize(d.bytes))}</span><span>${p.toFixed(0)}%</span></div></article>`;
  }).join(''):`<div class="empty-state"><div class="empty-icon">◈</div><strong>No direct downloads yet</strong><p>Downloaded media files from Detected will appear here.</p></div>`;
}
async function downloadMedia(index){
  const m=state.tabMedia[Number(index)];if(!m)return;
  if(m.type==='direct'){
    const title=m.label&&!m.label.includes('media')?m.label.replace(/\.(mp4|webm|mov|mkv|avi|flv)$/i,''):(state.activeTab?.title||'Video');
    try{
      const result=await chrome.runtime.sendMessage({action:'DOWNLOAD_DIRECT',url:m.url,title});
      if(!result.ok)throw Error(result.error||'Browser download failed');
      toast('Download started in Chrome.');navigate('downloads');await refreshActivity();
    }catch(error){toast('Could not save file: '+shorten(error.message,85));}
  }else{
    $('urlInput').value=m.url;updateMode('single');navigate('home');await downloadUrl(m.url,true);
  }
}
async function openFixedPanel(){
  if(document.body.dataset.mode==='sidepanel'){toast('You are already using the fixed side panel.');return;}
  try{
    if(!chrome.sidePanel?.open)throw Error('This browser does not support extension side panels.');
    // Must remain directly inside the user's click callback for Chrome's gesture check.
    const windowId=state.activeTab?.windowId??chrome.windows.WINDOW_ID_CURRENT;
    // Call open synchronously from the click to retain Chrome's user gesture.
    await chrome.sidePanel.open({windowId});
    if(document.body.dataset.mode==='dashboard')toast('Fixed side panel opened.');
  }catch(error){
    toast('Cannot open side panel: '+shorten(error.message,90));
    if(document.body.dataset.mode==='popup')chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}).catch(()=>{});
  }
}
const GITHUB_RELEASES_URL = 'https://github.com/soahimrahman/StreamCatch/releases';

function renderUpdateUI(update){
  const isAvailable = Boolean(update?.available);
  const version = update?.latestVersion || '';

  const pill = $('updatePill');
  if (pill) {
    pill.style.display = isAvailable ? 'flex' : 'none';
    const vEl = $('updateVersionPill');
    if (vEl) vEl.textContent = version;
  }

  const banner = $('updateAlertBanner');
  if (banner) {
    banner.style.display = isAvailable ? 'flex' : 'none';
    const vEl = $('updateVersionBanner');
    if (vEl) vEl.textContent = version;
  }

  const sideBox = $('sidebarUpdateBox');
  if (sideBox) {
    sideBox.style.display = isAvailable ? 'flex' : 'none';
    const vEl = $('updateVersionSidebar');
    if (vEl) vEl.textContent = version;
  }

  const statusEl = $('updateCheckStatus');
  if (statusEl) {
    if (isAvailable) {
      statusEl.textContent = `🚀 Update available: v${version}`;
      statusEl.style.color = '#aa96ff';
    } else {
      statusEl.textContent = `✓ Up to date (v${chrome.runtime.getManifest().version})`;
      statusEl.style.color = '#44dab2';
    }
  }
}

async function doReloadExtension(){
  toast('Reloading StreamCatch extension...');
  try {
    await chrome.runtime.sendMessage({ action: 'RELOAD_EXTENSION' });
  } catch {}
  setTimeout(() => {
    try { chrome.runtime.reload(); } catch {}
  }, 100);
}

function openReleasePage(){
  chrome.tabs.create({ url: GITHUB_RELEASES_URL }).catch(() => {});
}

async function handleCheckForUpdates(notify = true){
  if (notify) toast('Checking GitHub for updates...');
  const statusEl = $('updateCheckStatus');
  if (statusEl) {
    statusEl.textContent = 'Checking GitHub...';
    statusEl.style.color = '#8d9ab4';
  }

  try {
    const res = await chrome.runtime.sendMessage({ action: 'CHECK_FOR_UPDATES' });
    const update = res?.update;
    renderUpdateUI(update);
    if (update?.available) {
      toast(`🚀 Update v${update.latestVersion} found! Click Reload to apply.`);
    } else if (notify) {
      toast(`StreamCatch is up to date (v${chrome.runtime.getManifest().version}).`);
    }
  } catch (err) {
    if (notify) toast('Could not check updates: ' + (err?.message || err));
  }
}
async function init(){
  const settings=await chrome.storage.local.get(['quality','format','resolution','downloadMode','cookieBrowser','captureEnabled','downloadProvider']);
  await chrome.storage.local.remove('pairKey');
  const oldQuality=settings.quality;
  syncFormats(settings.format||(oldQuality==='audio'?'mp3':oldQuality==='mp4'?'mp4':'auto'),false);
  syncResolution(settings.resolution||(RESOLUTIONS.includes(oldQuality)?oldQuality:'best'),false);
  updateMode(settings.downloadMode||'single',false);
  updateProvider(['engine','browser'].includes(settings.downloadProvider)?settings.downloadProvider:'engine',false);
  state.cookieBrowser=['none','chrome','edge','firefox','brave'].includes(settings.cookieBrowser)?settings.cookieBrowser:'none';
  $('cookieBrowser').value=state.cookieBrowser;$('captureEnabled').checked=settings.captureEnabled!==false;
  document.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.route)));
  $('openDashboard').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}));
  $('openSidePanel').addEventListener('click',openFixedPanel);
  $('urlForm').addEventListener('submit',e=>{e.preventDefault();downloadUrl();});
  $('urlInput').addEventListener('input',()=>{if(state.downloadMode==='single'&&looksLikePlaylist($('urlInput').value))$('modeHint').textContent='Playlist URL detected. Choose Playlist / channel to download all its videos.';});
  $('inspectButton').addEventListener('click',inspectUrl);
  $('useCurrent').addEventListener('click',async()=>{await loadTab(true);toast('Current tab URL selected.');});
  $('pasteButton').addEventListener('click',async()=>{try{const text=await navigator.clipboard.readText();if(!isWebUrl(text.trim()))throw Error();$('urlInput').value=text.trim();toast('Video URL pasted.');}catch{toast('Use Ctrl+V to paste a URL.');}});
  document.querySelectorAll('[data-download-mode]').forEach(btn=>btn.addEventListener('click',()=>updateMode(btn.dataset.downloadMode)));
  document.querySelectorAll('[data-download-provider]').forEach(btn=>btn.addEventListener('click',()=>updateProvider(btn.dataset.downloadProvider)));
  if($('defaultProviderSelect'))$('defaultProviderSelect').addEventListener('change',e=>updateProvider(e.target.value));
  ['formatSelect','bulkFormatSelect'].forEach(id=>$(id).addEventListener('change',e=>syncFormats(e.target.value)));
  ['resolutionSelect','bulkResolutionSelect'].forEach(id=>$(id).addEventListener('change',e=>syncResolution(e.target.value)));
  $('bulkInput').addEventListener('input',renderBulkCount);
  $('bulkDownload').addEventListener('click',bulkDownload);
  $('bulkUseTabs').addEventListener('click',useOpenTabs);
  $('bulkPaste').addEventListener('click',async()=>{try{const text=await navigator.clipboard.readText();$('bulkInput').value=[...[$('bulkInput').value,text].filter(Boolean)].join('\n');renderBulkCount();}catch{toast('Use Ctrl+V in the bulk field.');}});
  $('bulkClear').addEventListener('click',()=>{$('bulkInput').value='';renderBulkCount();});
  $('mediaList').addEventListener('click',async event=>{const dl=event.target.closest('[data-media-download]'),copy=event.target.closest('[data-media-copy]');if(dl)await downloadMedia(dl.dataset.mediaDownload);if(copy){const m=state.tabMedia[Number(copy.dataset.mediaCopy)];if(m){await navigator.clipboard.writeText(m.url);toast('URL copied.');}}});
  $('clearMedia').addEventListener('click',async()=>{if(!state.activeTab?.id)return;await chrome.runtime.sendMessage({action:'CLEAR_MEDIA',tabId:state.activeTab.id});await refreshMedia();toast('Detected files cleared.');});
  $('refreshMedia').addEventListener('click',refreshMedia);
  $('refreshJobs').addEventListener('click',refreshActivity);
  $('clearCompleted').addEventListener('click',async()=>{if(!await ensureOnline())return;try{const r=await api('/clear-completed','POST',{ok:true});toast(`Cleared ${r.count} finished jobs.`);await refreshActivity();}catch(error){toast(error.message);}});
  $('jobsList').addEventListener('click',async event=>{
    const source=event.target.closest('[data-open-source]');
    if(source){const job=state.jobs.find(j=>j.id===source.dataset.openSource);if(job&&isWebUrl(job.url)){await chrome.tabs.create({url:job.url});}return;}
    const retry=event.target.closest('[data-retry-job]');
    if(retry){try{await api('/retry','POST',{id:retry.dataset.retryJob});toast('Retry added to the queue.');await refreshActivity();}catch(error){toast('Retry failed: '+error.message);}return;}
    const btn=event.target.closest('[data-cancel-job]');if(!btn)return;
    try{await api('/cancel','POST',{id:btn.dataset.cancelJob});toast('Cancellation requested.');await refreshActivity();}catch(error){toast(error.message);}
  });
  $('openFolder').addEventListener('click',async()=>{if(!await ensureOnline())return;try{await api('/open-folder','POST',{open:true});}catch(error){toast('Unable to open folder: '+shorten(error.message,90));}});
  $('savePair').addEventListener('click',async()=>showConnectionResult(await checkEngine(true)));
  $('testServer').addEventListener('click',()=>chrome.tabs.create({url:HOST+'/health'}));
  $('cookieBrowser').addEventListener('change',async e=>{state.cookieBrowser=e.target.value;await chrome.storage.local.set({cookieBrowser:state.cookieBrowser});toast('Preference saved.');});
  $('captureEnabled').addEventListener('change',async e=>{await chrome.storage.local.set({captureEnabled:e.target.checked});toast(e.target.checked?'Media detection enabled.':'Media detection disabled.');});

  // Check and render update notifications
  chrome.storage.local.get('updateAvailable').then(({ updateAvailable }) => {
    if (updateAvailable) renderUpdateUI(updateAvailable);
  }).catch(() => {});

  ['updateReloadBtnPill', 'updateReloadBtnBanner', 'updateReloadBtnSidebar'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', doReloadExtension);
  });

  ['updateGetBtnPill', 'updateGetBtnBanner', 'updateGetBtnSidebar'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', openReleasePage);
  });

  ['checkUpdateBtn', 'checkUpdateSettingsBtn'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', () => handleCheckForUpdates(true));
  });

  ['startEngineTopBtn', 'startEngineHomeBtn', 'startEngineSettingsBtn', 'startEngineSidebarBtn'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', startEngineProcess);
  });

  await Promise.all([checkEngine().then(showConnectionResult),loadTab()]);await refreshActivity();renderBulkCount();
  setInterval(async()=>{
    if(document.visibilityState==='hidden')return;
    const isUserActive=(Date.now()-(state.lastUserAction||0))<300000;
    const hasActiveJobs=state.jobs.some(j=>['analyzing','downloading','processing'].includes(j.status));
    if(!isUserActive&&!hasActiveJobs&&!state.engineOnline)return;
    if(state.route==='downloads'||state.route==='home')await refreshActivity();
    if(state.route==='detected')await refreshMedia();
  },2300);
  setInterval(async()=>{
    if(document.visibilityState==='visible'){
      const isUserActive=(Date.now()-(state.lastUserAction||0))<300000;
      if(!isUserActive&&!state.engineOnline)return;
      await checkEngine().then(showConnectionResult);
      if(document.body.dataset.mode==='sidepanel')await loadTab();
    }
  },6500);
  chrome.tabs.onActivated?.addListener(()=>{if(document.body.dataset.mode==='sidepanel')loadTab();});
}
init().catch(error=>{console.error('StreamCatch UI error:',error);toast('Cannot initialize StreamCatch. Reload this extension.');});
