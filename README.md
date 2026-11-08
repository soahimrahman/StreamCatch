# StreamCatch — Universal Video & Media Studio

<p align="center">
  <img src="extension/icons/icon128.png" alt="StreamCatch Logo" width="108" height="108" />
</p>

<p align="center">
  <strong>Universal Video, Audio, Playlist & Bulk Media Downloader Studio</strong><br />
  A powerful, local-first Chromium extension with a persistent side panel backed by a zero-configuration Python engine.
</p>

<p align="center">
  <a href="https://github.com/soahimrahman/StreamCatch/releases"><img src="https://img.shields.io/badge/version-v1.2.1-7157e9?style=for-the-badge&logo=semver&logoColor=white" alt="Version 1.2.1" /></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/intro/"><img src="https://img.shields.io/badge/Manifest-V3-44dab2?style=for-the-badge&logo=googlechrome&logoColor=black" alt="Manifest V3" /></a>
  <a href="#-option-1-one-command-global-npm-install-recommended"><img src="https://img.shields.io/badge/npm%20install-soahimrahman%2FStreamCatch-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm install" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.8+-3776ab?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.8+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT License" /></a>
  <a href="https://github.com/soahimrahman/StreamCatch/actions"><img src="https://img.shields.io/badge/Tests-Passing-brightgreen?style=for-the-badge&logo=githubactions&logoColor=white" alt="CI Status" /></a>
  <a href="https://www.supportkori.com/soahimrahmantasin17"><img src="https://img.shields.io/badge/Donate-SupportKori-ffd889?style=for-the-badge&logo=coffeescript&logoColor=black" alt="Support Kori" /></a>
  <a href="https://www.facebook.com/soahim.rahman.tasin17/"><img src="https://img.shields.io/badge/Author-Soahim%20Rahman%20Tasin-1877F2?style=for-the-badge&logo=facebook&logoColor=white" alt="Author Facebook" /></a>
  <a href="#security--privacy"><img src="https://img.shields.io/badge/Privacy-100%25%20Localhost-success?style=for-the-badge&logo=shield" alt="Localhost Only" /></a>
</p>

---

## ⚡ Overview

**StreamCatch** bridges the gap between browser convenience and raw downloading power. Unlike sketchy web downloaders crammed with ads, popups, and bandwidth throttling, **StreamCatch runs entirely on your machine**.

It pairs an elegant, dark-mode **Chromium extension** (Popup, Chrome Side Panel, and Full-Tab Studio Dashboard) with a lightweight, secure **local Python engine** powered by [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) and [`FFmpeg`](https://ffmpeg.org/).

- 🔒 **Zero Accounts & Zero Cloud Relays:** No sign-ups, no logins, no third-party tracking, and no external servers touching your files.
- ⚡ **Auto-Connect (Zero Pairing Keys):** Launch the helper and start downloading instantly. The extension and helper negotiate secure loopback connections automatically.
- 📌 **Fixed Chrome Side Panel (Chrome 116+):** The popup doesn't vanish when you click away — pin the persistent side panel while browsing or queuing links.
- 🎬 **Full Resolution & Format Control:** Grab up to 4K / 2160p video in MP4, MKV, or WebM, or extract pristine audio to FLAC, WAV, M4A, or MP3.
- 📑 **True Playlists & Channels:** Download entire collections or selected ranges with truthful progress and no silent failures.
- 📦 **Bulk URL Batch Manager:** Queue up to 100 links at once, grab URLs from all open tabs, and automatically deduplicate.
- 🔍 **Live Media Sniffer:** Detects active video and audio streams (direct MP4/WebM files, HLS `.m3u8`, and DASH `.mpd` adaptive streams) right from the active tab.

---

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Browser [" Chromium Browser (Chrome / Edge / Brave) "]
        direction TB
        Tab["Active Web Tab\n(YouTube, Vimeo, etc.)"]
        ExtUI["StreamCatch Studio UI\n(Side Panel / Popup / Dashboard)"]
        CS["Content Script &\nNetwork Sniffer"]
        Tab -->|Media requests & URLs| CS
        CS -->|Discovered Streams| ExtUI
    end

    subgraph LocalEngine [" Local Machine (127.0.0.1:8735) "]
        direction TB
        Server["StreamCatch Engine (server.py)\nThreading HTTPServer + Worker Pool"]
        YTDL["yt-dlp Extractor Engine"]
        FFMPEG["FFmpeg Remuxer & Transcoder"]
        Disk[("Local Storage\n~/Downloads/StreamCatch")]

        Server -->|Process Jobs| YTDL
        YTDL -->|Transcode / Merge| FFMPEG
        FFMPEG -->|Write Media| Disk
    end

    ExtUI -->|HTTP / JSON via Loopback\n(X-StreamCatch-Client + Origin)| Server
```

---

## ✨ Features & Capabilities

| Feature | Description |
| :--- | :--- |
| **Single Video Downloads** | Paste any URL or click **Use link** from the current active tab. Select exact resolution caps (4K, 1440p, 1080p, 720p, etc.) and format. |
| **Playlist & Channel Mirroring** | Toggle **Playlist / channel** to download entire series or choose ranges (**First 25, 50, 100, 250, 500**). Playlists are automatically sorted into organized subdirectories (`Playlists/<Playlist Title>/001 - Title.mp4`). |
| **Bulk URL Queue** | Paste batches up to 100 links or click **+ Open tabs** to pull video URLs from all tabs currently open in your browser window. Duplicates are filtered automatically. |
| **Audio Extraction** | Convert videos into high-quality audio files: Lossless **FLAC**, uncompressed **WAV**, pristine **M4A**, or **MP3 (192 kbps)**. |
| **Persistent Side Panel** | Take advantage of the modern Chrome Side Panel API (`sidePanel`). The downloader stays open alongside your tabs without disappearing when you click the webpage. |
| **Live Media Sniffer** | Actively sniffs network requests and video elements on webpages. Direct MP4/WebM files download via Chrome, while segmented HLS (`.m3u8`) and DASH (`.mpd`) streams route through the local engine. |
| **Queue & Transfer Manager** | Inspect queued, analyzing, active, partial, and completed downloads. Cancel running transfers, retry partial or failed jobs, and open your output folder in one click. |
| **Truthful Error Diagnostics** | Clear classification of network timeouts (**Curl error 28**), DNS resolution failures, HTTP 403 access limitations, and conversion faults instead of confusing technical traces. |
| **Optional Authenticated Sessions** | Opt-in ability to pass authorized browser session cookies for personal content you own or have permission to access. Disabled by default. |

---

## 🚀 Quick Start Guide

### Prerequisites

1. **Python 3.8 or higher** installed. *(Ensure "Add python.exe to PATH" was selected during install).*
2. **Google Chrome 116+**, **Microsoft Edge**, **Brave**, or any Chromium browser supporting Manifest V3.

---

### 📦 Option 1: One-Command Global NPM Install (Recommended)

You can install and run StreamCatch anywhere with **one npm command**:

```bash
# Install globally via npm
npm install -g soahimrahman/StreamCatch
```

Or run it on-demand with **`npx`** without even installing:

```bash
npx github:soahimrahman/StreamCatch
```

#### Running the CLI

Once installed, start the local engine simply by running:

```bash
streamcatch
```

#### Handy CLI Commands

| Command | Action |
| :--- | :--- |
| `streamcatch` | Starts the download engine on `http://127.0.0.1:8735` |
| `streamcatch --open` *(or `-o`)* | Opens the `extension/` folder in your file explorer |
| `streamcatch --path` *(or `-p`)* | Prints the exact path to the extension directory |
| `streamcatch --setup` | Verifies and updates `yt-dlp` and `imageio-ffmpeg` |
| `streamcatch --test` | Runs the automated test suite |

---

### 💻 Option 2: Local Git Clone + NPM Setup

If you prefer cloning the repository directly:

```bash
# 1. Clone repository
git clone https://github.com/soahimrahman/StreamCatch.git
cd StreamCatch

# 2. Automatically install all dependencies
npm install

# 3. Start the engine
npm start
```

#### Available `npm` Scripts

- `npm install` *(or `npm run setup`)* — Installs and checks `yt-dlp` & `imageio-ffmpeg`.
- `npm start` — Boots the local engine on `127.0.0.1:8735`.
- `npm test` — Executes the 8-point automated test suite.
- `npm run build` — Recompiles the UI HTML templates from `build_ui.py`.
- `npm run troubleshoot` — Runs the connection, DNS & TLS reachability probe.

---

### 🖱️ Option 3: Native One-Click Launchers (No Node.js Required)

If you don't have Node.js or npm installed, use the native launchers:

#### ⚡ Silent Background Auto-Start & In-Extension 1-Click Launch (Recommended for Windows)

To run StreamCatch completely seamlessly without keeping a command prompt window open:

1. Double-click:
   ```cmd
   SETUP_AUTO_START_WINDOWS.bat
   ```
2. **What this does:**
   - **Zero-Fuss Boot:** StreamCatch starts silently in the background whenever your PC turns on.
   - **In-Extension 1-Click Launch:** Adds a **`🚀 Start Engine`** button right inside the Chrome/Edge extension. If the helper is ever stopped, you can wake it up directly from the browser!
   - **Completely Invisible:** Runs via silent background VBScript, so no black terminal window stays open on your taskbar.
3. **To stop the engine anytime:** Double-click `STOP_STREAMCATCH_WINDOWS.bat`.
4. **To disable auto-start anytime:** Double-click `DISABLE_AUTO_START_WINDOWS.bat`.

#### Normal Console Mode on Windows

If you prefer seeing real-time download logs in a terminal window:

```cmd
START_STREAMCATCH_WINDOWS.bat
```

#### On macOS & Linux

Run:

```bash
chmod +x START_STREAMCATCH_MAC_LINUX.sh helper/START_MAC_LINUX.sh
./START_STREAMCATCH_MAC_LINUX.sh
```

---

### 🧩 Adding the Extension to Chrome / Edge

> [!NOTE]
> **Why is loading the extension in Developer Mode required?**
> Due to Chromium security safeguards, Google Chrome and Microsoft Edge do not permit any command-line tool (including npm) to inject extensions directly into a browser profile without user consent (to protect against rogue spyware). Loading it takes under 10 seconds:

1. In your browser, open:
   - **Google Chrome / Brave:** `chrome://extensions`
   - **Microsoft Edge:** `edge://extensions`
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `extension/` folder (or run `streamcatch --open` to reveal it in your file explorer).
5. Pin **StreamCatch** to your browser toolbar!

---

### 🎬 Start Downloading

1. Click the **StreamCatch** icon in your toolbar.
2. The indicator will show **Engine online** with a green pulse.
3. Paste a link or click **Use link**, choose your format and quality, and click **Download now**!
4. *(Optional)* Click **▣ Fixed panel** at the top to open the persistent side panel that stays open as you browse.

---

## 🎯 Supported Formats & Resolutions

| Type | Format / Container | Notes |
| :--- | :--- | :--- |
| **Video** | `Best original (Auto)` | Downloads highest quality native streams without lossy re-encoding |
| **Video** | `MP4` | Industry-standard compatibility (H.264/AAC or best matching streams) |
| **Video** | `MKV` | Robust container supporting multi-audio tracks and subtitles |
| **Video** | `WebM` | Modern web format (VP9/AV1 + Opus) |
| **Audio** | `MP3` | Universal MP3 format encoded at 192 kbps |
| **Audio** | `M4A` | High-efficiency AAC audio stream |
| **Audio** | `WAV` | Uncompressed PCM audio |
| **Audio** | `FLAC` | Lossless compressed audio extraction |

**Resolution Caps:** `Best available`, `4K (2160p)`, `1440p (2K)`, `1080p (Full HD)`, `720p (HD)`, `480p`, `360p`.

---

## 📁 Project Directory Structure

```text
StreamCatch/
├── .github/
│   └── workflows/
│       └── ci.yml                     # Multi-OS CI workflow (Ubuntu, Windows, macOS)
├── bin/
│   └── cli.js                         # Global CLI entry point (npm install -g streamcatch)
├── scripts/                           # Cross-platform Node / npm automation
│   ├── setup.js                       # Auto-detects Python & installs pip requirements
│   └── start.js                       # Cross-platform engine runner
├── extension/                         # Chromium Extension (Manifest V3)
│   ├── manifest.json                  # Extension metadata, permissions & fixed key
│   ├── background.js                  # Background service worker & network request sniffer
│   ├── content.js                     # DOM media scanner for embedded video elements
│   ├── popup.html                     # Standard dropdown popup interface
│   ├── sidepanel.html                 # Chrome Side Panel interface
│   ├── dashboard.html                 # Full-tab workspace dashboard
│   ├── popup.js                       # UI controller, state manager & API client
│   ├── styles.css                     # Dark-mode design system & animations
│   └── icons/                         # Extension icons (16, 32, 48, 128px)
├── helper/                            # Local Python Download Engine
│   ├── server.py                      # Multi-threaded HTTP loopback server (yt-dlp/FFmpeg)
│   ├── extension_origin.py            # Extension ID & Origin integrity binding
│   ├── requirements.txt               # Engine dependencies (yt-dlp, imageio-ffmpeg)
│   ├── check_connection.py            # User-friendly network & TLS reachability probe
│   ├── CHECK_SITE_CONNECTION_WINDOWS.bat # One-click network diagnostic tool
│   ├── START_WINDOWS.bat              # Windows dependency bootstrap & server runner
│   ├── START_MAC_LINUX.sh             # POSIX bootstrap & server runner
│   ├── TROUBLESHOOT_WINDOWS.bat       # Port & HTTP diagnostic tool
│   └── UPDATE_ENGINE_WINDOWS.bat      # One-click updater for yt-dlp & FFmpeg
├── tests/
│   └── test_local_api.py              # Mocked integration test suite for engine endpoints
├── build_ui.py                        # Single-source HTML generator for extension views
├── package.json                       # npm automated scripts, CLI & package metadata
├── START_STREAMCATCH_WINDOWS.bat      # Root Windows launcher
├── START_STREAMCATCH_MAC_LINUX.sh     # Root macOS/Linux launcher
├── .gitignore                         # Complete Git ignore definitions
├── LICENSE                            # MIT License
└── README.md                          # Project documentation
```

---

## 🩺 Diagnostics & Troubleshooting

StreamCatch includes built-in diagnostic tools to help identify problems quickly:

### 1. "Curl (28) Connection Timed Out"

- **Meaning:** Your computer could not establish a TCP connection to the website's media server within 25 seconds.
- **Cause:** Network firewalls, DNS blocks, ISP filtering, VPN conflicts, or temporary outage on the destination server.
- **Fix:** Run `npm run troubleshoot` (or `helper/CHECK_SITE_CONNECTION_WINDOWS.bat`), enter the domain, and review the DNS and TCP 443 handshake report.

### 2. "HTTP 403 Forbidden" When Opening `http://127.0.0.1:8735/health` in a Tab

- **This is expected and normal!**
- The helper enforces strict Origin and Header verification (`X-StreamCatch-Client`). Ordinary web pages and browser tabs cannot access the engine. An HTTP 403 proves that the local engine is online and secured against unauthorized local web scripts.

### 3. Port 8735 Already in Use

- If an older instance of the helper is already running, close its terminal window or run `helper/TROUBLESHOOT_WINDOWS.bat` to see which Process ID (PID) owns port 8735.

### 4. Updating Extractor Engines

Websites frequently modify their streaming formats. Keep `yt-dlp` current by running:

```bash
streamcatch --setup
# or: npm run setup
```

*(or on Windows: `helper\UPDATE_ENGINE_WINDOWS.bat`)*

---

## 🔒 Security & Privacy Guarantees

- **Loopback Binding Only:** The helper binds exclusively to `127.0.0.1`. It never listens on public interfaces or your local area network (LAN).
- **Origin Validation:** The local server validates that all incoming requests originate from the designated Chrome Extension ID (`fhhkhlchlohgbnokeheoamkpifoiflgb`).
- **No External Telemetry:** StreamCatch contains zero analytics, trackers, pingbacks, or third-party tracking scripts.
- **Strict URL Sanitization:** Public HTTP/HTTPS URLs are strictly validated before being submitted to the downloader pool to mitigate SSRF and local network traversal.
- **Cookie Security:** Browser cookie inspection (`cookiesfrombrowser`) is strictly opt-in and disabled by default.

---

## 🧪 Development & Testing

Run the automated test suite via npm:

```bash
npm test
```

*(or directly with Python: `python -m unittest discover -s tests -v`)*

If you modify the UI in `build_ui.py`, recompile the template across `popup.html`, `sidepanel.html`, and `dashboard.html`:

```bash
npm run build
```

---

## 📜 Legal & Ethical Usage

StreamCatch is provided for personal archiving, educational research, and downloading media content that you own or have explicit permission to save.

- StreamCatch **does not circumvent DRM**, bypass paywalls, or decrypt encrypted content.
- Always respect copyright laws and the terms of service of any website you interact with.

---

## 👨‍💻 Creator & Support

StreamCatch is designed and engineered by **Soahim Rahman Tasin**.

- 🌐 **Facebook Profile:** [soahim.rahman.tasin17](https://www.facebook.com/soahim.rahman.tasin17/)
- ☕ **Support & Donation:** If StreamCatch simplifies your media downloads and saves your time, support ongoing open-source development at [Support Kori](https://www.supportkori.com/soahimrahmantasin17).

---

## 📄 License

This project is licensed under the terms of the [MIT License](LICENSE).

---

<p align="center">
  Crafted with care by <a href="https://www.facebook.com/soahim.rahman.tasin17/">Soahim Rahman Tasin</a>.
</p>
