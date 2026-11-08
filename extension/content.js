// Collect URLs already exposed by video players on this page; never access cookies.
'use strict';
(() => {
  const seen=new Set();
  let timer=null;
  function consider(candidate,list,label='Embedded video'){
    if (!candidate || typeof candidate!=='string') return;
    try {
      const u=new URL(candidate, location.href);
      if (!/^https?:$/.test(u.protocol)) return;
      if (seen.has(u.href)) return;
      seen.add(u.href);
      if (seen.size > 500) seen.clear();
      list.push({url:u.href,label});
    } catch {}
  }
  function scan(){
    const list=[];
    document.querySelectorAll('video').forEach(v=>{
      consider(v.currentSrc,list,'Video player');
      consider(v.src,list,'Video player');
      v.querySelectorAll('source[src]').forEach(s=>consider(s.src,list,'Video source'));
    });
    document.querySelectorAll('meta[property="og:video"],meta[property="og:video:url"],meta[name="twitter:player:stream"]').forEach(m=>consider(m.content,list,'Page metadata'));
    if (list.length) chrome.runtime.sendMessage({action:'MEDIA_FROM_PAGE',items:list.slice(0,35)}).catch(()=>{});
  }
  function schedule(){ if (timer) return; timer=setTimeout(()=>{timer=null;scan();},600); }
  scan();
  document.addEventListener('play',schedule,true);
  document.addEventListener('loadedmetadata',schedule,true);
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','content']});
  // Video elements can change currentSrc without a DOM mutation.
  setInterval(scan,12000);
})();
