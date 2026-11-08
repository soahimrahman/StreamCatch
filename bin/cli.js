#!/usr/bin/env node
'use strict';

const { spawnSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PKG_ROOT = path.resolve(__dirname, '..');
const EXTENSION_DIR = path.join(PKG_ROOT, 'extension');
const SERVER_SCRIPT = path.join(PKG_ROOT, 'helper', 'server.py');
const REQUIREMENTS = path.join(PKG_ROOT, 'helper', 'requirements.txt');

function findPython() {
  const commands = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const cmd of commands) {
    const args = cmd === 'py' ? ['-3', '--version'] : ['--version'];
    try {
      const res = spawnSync(cmd, args, { stdio: 'ignore', windowsHide: true });
      if (res && res.status === 0) {
        return cmd === 'py' ? { bin: 'py', prefix: ['-3'] } : { bin: cmd, prefix: [] };
      }
    } catch (_) {}
  }
  return null;
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
StreamCatch v1.2.1 — Universal Video & Media Downloader Studio
CLI & Local Download Engine

Usage:
  streamcatch [options]
  npx github:soahimrahman/StreamCatch [options]

Options:
  --open, -o            Open the extension directory in your file manager
  --path, -p            Print the absolute path to the Chrome extension folder
  --setup               Verify and install Python media dependencies (yt-dlp, FFmpeg)
  --test                Run integration tests
  --port <number>       Specify custom server port (default: 8735)
  --help, -h            Show this help message

Browser Extension Setup:
  1. Open chrome://extensions (or edge://extensions) in your browser.
  2. Turn on "Developer mode" in the top-right.
  3. Click "Load unpacked" and select:
     ${EXTENSION_DIR}
`);
  process.exit(0);
}

if (args.includes('--path') || args.includes('-p')) {
  console.log(EXTENSION_DIR);
  process.exit(0);
}

if (args.includes('--open') || args.includes('-o')) {
  console.log(`Opening extension directory:\n${EXTENSION_DIR}`);
  if (process.platform === 'win32') {
    spawn('explorer.exe', [EXTENSION_DIR], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    spawn('open', [EXTENSION_DIR], { detached: true, stdio: 'ignore' });
  } else {
    spawn('xdg-open', [EXTENSION_DIR], { detached: true, stdio: 'ignore' });
  }
  process.exit(0);
}

const py = findPython();
if (!py) {
  console.error('\n❌ Python 3 was not found on your system.');
  console.error('StreamCatch engine requires Python 3.8+ to run yt-dlp & FFmpeg.');
  console.error('Download Python: https://www.python.org/downloads/ (remember to check "Add to PATH").\n');
  process.exit(1);
}

if (args.includes('--test')) {
  console.log('\nRunning test suite...');
  const testRes = spawnSync(py.bin, [...py.prefix, '-m', 'unittest', 'discover', '-s', path.join(PKG_ROOT, 'tests'), '-v'], {
    stdio: 'inherit',
    cwd: PKG_ROOT
  });
  process.exit(testRes.status || 0);
}

if (args.includes('--setup')) {
  console.log(`\nInstalling Python requirements from ${REQUIREMENTS}...`);
  const setupRes = spawnSync(py.bin, [...py.prefix, '-m', 'pip', 'install', '-r', REQUIREMENTS], {
    stdio: 'inherit',
    cwd: PKG_ROOT
  });
  process.exit(setupRes.status || 0);
}

// Auto-check dependencies or install if needed
console.log('\n[StreamCatch] Ensuring yt-dlp & FFmpeg dependencies are available...');
const checkYtdlp = spawnSync(py.bin, [...py.prefix, '-c', 'import yt_dlp, imageio_ffmpeg; print("OK")'], {
  stdio: 'ignore'
});

if (!checkYtdlp || checkYtdlp.status !== 0) {
  console.log('[StreamCatch] Installing required dependencies (yt-dlp, imageio-ffmpeg)...');
  spawnSync(py.bin, [...py.prefix, '-m', 'pip', 'install', '-r', REQUIREMENTS], {
    stdio: 'inherit',
    cwd: PKG_ROOT
  });
}

console.log(`
==================================================================
  STREAMCATCH v1.2.1  /  LOCAL ENGINE
==================================================================
  Extension Folder:  ${EXTENSION_DIR}
  To load into Chrome/Edge:
    1. Visit chrome://extensions (or edge://extensions)
    2. Enable "Developer mode"
    3. Click "Load unpacked" and select the Extension Folder above
==================================================================
`);

// Forward remaining arguments to server.py (e.g. --port 8735)
const serverRes = spawnSync(py.bin, [...py.prefix, SERVER_SCRIPT, ...args], {
  stdio: 'inherit',
  cwd: PKG_ROOT
});

process.exit(serverRes.status || 0);
