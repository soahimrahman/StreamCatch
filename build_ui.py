from pathlib import Path
root=Path(__file__).parent/'extension'
html='''<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StreamCatch</title><link rel="stylesheet" href="styles.css"></head>
<body data-mode="__MODE__">
<div class="shell">
  <aside class="sidebar">
    <div class="brand-row">
      <div class="logo-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="9" stroke="currentColor" stroke-width="2"/><path d="M13 10.5 23 16l-10 5.5v-11Z" fill="currentColor"/></svg></div>
      <div class="brandtext">stream<span>catch</span><small>DOWNLOAD STUDIO</small></div>
      <span class="brand-version">1.2.1</span>
    </div>
    <p class="side-label">WORKSPACE</p>
    <nav class="nav" aria-label="Navigation">
      <button class="nav-item active" data-route="home" title="Downloader"><span class="nav-symbol">↓</span><span class="nav-text">Download</span></button>
      <button class="nav-item" data-route="bulk" title="Bulk downloads"><span class="nav-symbol">▤</span><span class="nav-text">Bulk</span></button>
      <button class="nav-item" data-route="detected" title="Detected media"><span class="nav-symbol">◈</span><span class="nav-text">Detected</span><span class="nav-count" id="mediaCount">0</span></button>
      <button class="nav-item" data-route="downloads" title="Download activity"><span class="nav-symbol">◷</span><span class="nav-text">Activity</span></button>
      <button class="nav-item" data-route="settings" title="Settings"><span class="nav-symbol">⚙</span><span class="nav-text">Settings</span></button>
    </nav>
    <div class="sidebar-bottom"><div id="sideConnection" class="connection"><span class="pulse"></span><span id="sideConnectionText">Checking engine</span></div><button class="subtle-full" id="openDashboard">↗ Full dashboard</button></div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div class="breadcrumb">WORKSPACE <span>/</span> <strong id="routeCrumb">Download</strong></div>
      <div class="top-actions"><span id="engineStatus" class="status-pill"><span class="status-dot"></span><span>Checking</span></span><button id="openSidePanel" class="pin-button" title="Open the fixed Chrome side panel">▣ <span>Fixed panel</span></button></div>
    </header>
    <section class="view active" id="view-home">
      <div class="page-heading"><div class="heading-kicker">SIMPLE · FAST · LOCAL</div><h1>Save something <span>great.</span></h1><p>Paste a link, select the format and hit download. Your files stay on your computer.</p></div>
      <div class="workspace-grid">
        <div class="main-column">
          <div class="tab-source"><div class="source-icon" id="platformIcon">▶</div><div class="source-copy"><small>OPEN BROWSER TAB</small><strong id="currentTabTitle">Finding current tab…</strong><span id="currentTabHost">—</span></div><button id="useCurrent" class="lite-button" type="button">Use link</button></div>
          <div class="form-card">
            <form id="urlForm">
              <div class="form-card-top"><div><h2>New download</h2><p>Choose how you want to save your media</p></div><span class="number-tag">01</span></div>
              <div class="mode-tabs" role="group" aria-label="Download mode"><button type="button" data-download-mode="single" class="mode-tab selected">▶ &nbsp;Single video</button><button type="button" data-download-mode="playlist" class="mode-tab">▤ &nbsp;Playlist / channel</button></div>
              <label class="field-label" for="urlInput">VIDEO OR PLAYLIST LINK</label>
              <div class="input-wrap"><span class="link-icon">↗</span><input id="urlInput" type="url" placeholder="https://www.youtube.com/watch?v=…" spellcheck="false" required><button type="button" id="pasteButton" class="inside-button">Paste</button></div>
              <div class="mode-hint" id="modeHint">Downloads the single video from your link. Even if it belongs to a playlist.</div>
              <div class="two-fields"><div><label class="field-label" for="formatSelect">SAVE AS</label><select id="formatSelect" class="field-select"><option value="auto">Best original (Auto)</option><option value="mp4">MP4 · Video</option><option value="mkv">MKV · Video</option><option value="webm">WebM · Video</option><option value="mp3">MP3 · Audio</option><option value="m4a">M4A · Audio</option><option value="wav">WAV · Audio</option><option value="flac">FLAC · Audio</option></select></div><div><label class="field-label" for="resolutionSelect">MAX RESOLUTION</label><select id="resolutionSelect" class="field-select"><option value="best">Best available</option><option value="2160">4K / 2160p</option><option value="1440">1440p</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option><option value="360">360p</option></select></div></div>
              <div id="playlistOptions" class="playlist-options hidden"><div class="setting-hline"><span>Playlist range</span><small>Large collections may take a while</small></div><select class="field-select" id="playlistLimit"><option value="0">Entire playlist (all entries)</option><option value="25">First 25 videos</option><option value="50">First 50 videos</option><option value="100">First 100 videos</option><option value="250">First 250 videos</option><option value="500">First 500 videos</option></select></div>
              <div class="action-row"><button type="submit" class="primary-btn" id="downloadButton"><span>↓</span> Download now <span class="btn-arrow">↗</span></button><button type="button" class="outline-btn" id="inspectButton">⌕ Preview</button></div>
              <p class="form-footnote">Only download content you own or have permission to save. DRM-protected media isn't supported.</p>
            </form>
            <div class="inspected hidden" id="inspected"></div>
          </div>
        </div>
        <div class="support-column"><div class="side-card"><span class="eyebrow">QUICK ACTIONS</span><h3>More ways to download</h3><button class="action-tile" data-route="bulk"><span class="tile-icon">▤</span><span><strong>Bulk downloader</strong><small>Queue up to 100 links at once</small></span><b>→</b></button><button class="action-tile" data-route="detected"><span class="tile-icon cyan">◈</span><span><strong>Find video files</strong><small>Detect playable files on this tab</small></span><b>→</b></button></div><div class="engine-card"><div class="eyebrow">LOCAL DOWNLOAD ENGINE</div><strong id="engineCardTitle">Checking connection…</strong><p id="engineCardMessage">Looking for your download engine.</p><button class="text-link" id="engineCardAction" data-route="settings">View connection →</button></div></div>
      </div>
    </section>
    <section class="view" id="view-bulk">
      <div class="page-heading compact"><div class="heading-kicker">MULTI-LINK MANAGER</div><h1>Bulk <span>downloader.</span></h1><p>Paste a batch of links and add them all to the local queue in one click.</p></div>
      <div class="form-card bulk-card"><div class="form-card-top"><div><h2>Queue multiple URLs</h2><p>One URL per line · Duplicate links removed automatically</p></div><span class="number-tag">02</span></div>
        <label class="field-label" for="bulkInput">YOUR VIDEO LINKS</label><textarea id="bulkInput" class="bulk-textarea" placeholder="https://www.youtube.com/watch?v=…&#10;https://www.facebook.com/watch/?v=…&#10;https://vimeo.com/…" spellcheck="false"></textarea>
        <div class="bulk-helper"><span id="bulkCount">0 valid links</span><div><button id="bulkPaste" type="button" class="text-link">Paste links</button><button id="bulkClear" type="button" class="text-link muted-link">Clear</button></div></div>
        <div class="two-fields"><div><label class="field-label" for="bulkFormatSelect">SAVE AS</label><select id="bulkFormatSelect" class="field-select"><option value="auto">Best original (Auto)</option><option value="mp4">MP4 · Video</option><option value="mkv">MKV · Video</option><option value="webm">WebM · Video</option><option value="mp3">MP3 · Audio</option><option value="m4a">M4A · Audio</option><option value="wav">WAV · Audio</option><option value="flac">FLAC · Audio</option></select></div><div><label class="field-label" for="bulkResolutionSelect">MAX RESOLUTION</label><select id="bulkResolutionSelect" class="field-select"><option value="best">Best available</option><option value="2160">4K / 2160p</option><option value="1440">1440p</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option><option value="360">360p</option></select></div></div>
        <label class="checkbox-row"><input id="bulkPlaylists" type="checkbox"><span><strong>Download full playlists when a URL is a playlist</strong><small>When off, downloads one video per link</small></span></label>
        <div class="action-row"><button id="bulkDownload" type="button" class="primary-btn"><span>⇩</span> Add all to queue <span class="btn-arrow">↗</span></button><button id="bulkUseTabs" type="button" class="outline-btn">+ Open tabs</button></div><p class="form-footnote">Up to 100 different links per batch. Downloads continue when this panel is closed, as long as the helper is running.</p>
      </div>
    </section>
    <section class="view" id="view-detected">
      <div class="page-heading compact"><div class="heading-kicker">BROWSER MEDIA SCANNER</div><h1>Detected <span>media.</span></h1><p>Play a video or reload its tab to discover downloadable media URLs.</p></div>
      <div class="section-heading"><h2>Media from active tab</h2><div><span class="mini-count" id="detectedSummary">SCANNING</span><button class="outline-btn small" id="refreshMedia">↻ Refresh</button></div></div><div id="mediaList" class="file-list"></div><p class="hint-box">Direct video files download through Chrome; segmented HLS/DASH streams use the local engine. Signed URLs may expire and DRM streams are not supported.</p><button class="text-link" id="clearMedia">Clear detected items</button>
    </section>
    <section class="view" id="view-downloads">
      <div class="page-heading compact"><div class="heading-kicker">TRANSFER MANAGER</div><h1>Your <span>downloads.</span></h1><p>See queued, active and completed downloads.</p></div>
      <div class="activity-stats"><div><small>IN PROGRESS</small><strong id="activeCount">0</strong></div><div><small>COMPLETED</small><strong id="completedCount">0</strong></div><div><small>QUEUED</small><strong id="queuedCount">0</strong></div></div>
      <div class="section-heading"><h2>Engine queue</h2><div><button id="refreshJobs" class="text-link">↻ Refresh</button><button id="openFolder" class="outline-btn small">▤ Folder</button></div></div><div id="jobsList" class="jobs-list"></div><button id="clearCompleted" class="text-link muted-link">Clear finished jobs</button>
      <div class="section-heading second"><h2>Browser downloads</h2></div><div id="directList" class="jobs-list"></div>
    </section>
    <section class="view" id="view-settings">
      <div class="page-heading compact"><div class="heading-kicker">PREFERENCES</div><h1>Settings<span>.</span></h1><p>Local-first. No account or pairing code needed.</p></div>
      <div class="settings-layout"><div class="settings-card"><div class="card-symbol">◎</div><h2>Automatic connection</h2><p>Start the new <code>START_STREAMCATCH_WINDOWS.bat</code> file. Keep its terminal window open; StreamCatch connects automatically.</p><div class="auto-connection"><span class="auto-led"></span><div><strong>DOWNLOAD ENGINE</strong><small>localhost:8735 · No pairing key</small></div></div><button id="savePair" class="primary-btn full">↻ Reconnect</button><p id="pairResult" class="result-line" role="status" aria-live="polite"></p><button id="testServer" class="text-link">Test server in browser →</button><p class="micro-hint">HTTP 403 in a normal browser tab is expected. Only the extension may access the engine.</p></div>
      <div class="settings-card"><div class="card-symbol teal">⚙</div><h2>Preferences</h2><p>Optional tools for media detection and sites requiring a signed-in browser session.</p><label class="field-label" for="cookieBrowser">SIGNED-IN CONTENT (OPTIONAL)</label><select id="cookieBrowser" class="field-select"><option value="none">Do not read cookies (recommended)</option><option value="chrome">Use Chrome session</option><option value="edge">Use Edge session</option><option value="firefox">Use Firefox session</option><option value="brave">Use Brave session</option></select><p class="micro-hint">Opt-in only. The local downloader may read your browser's session cookies for content you're authorized to access.</p><label class="checkbox-row"><input type="checkbox" checked id="captureEnabled"><span><strong>Detect media automatically</strong><small>Scan media requests on websites</small></span></label><div id="enginePath" class="path-info">Folder available when engine connects.</div></div></div>
    </section>
    <footer class="footer"><span>STREAMCATCH <i>·</i> DOWNLOADER STUDIO</span><span>MADE FOR YOUR OWN MEDIA</span></footer>
  </main>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="popup.js"></script></body></html>'''
for mode,name in [('popup','popup.html'),('dashboard','dashboard.html'),('sidepanel','sidepanel.html')]:
    (root/name).write_text(html.replace('__MODE__',mode),encoding='utf-8')
