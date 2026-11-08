#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

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

console.log('\n[StreamCatch] Checking Python environment...');
const py = findPython();
if (!py) {
  console.error('\n❌ Python 3 was not found on your system.');
  console.error('Please install Python 3.8+ from https://www.python.org/downloads/ (check "Add to PATH").\n');
  process.exit(1);
}

const reqPath = path.resolve(__dirname, '..', 'helper', 'requirements.txt');
console.log(`[StreamCatch] Installing engine dependencies from:\n  ${reqPath}\n`);

const installArgs = [...py.prefix, '-m', 'pip', 'install', '-r', reqPath];
const res = spawnSync(py.bin, installArgs, { stdio: 'inherit', windowsHide: true });

if (res.status !== 0) {
  console.error('\n❌ Dependency installation failed. Please check your internet connection or pip.\n');
  process.exit(res.status || 1);
}

console.log('\n✅ StreamCatch dependencies installed successfully!\n');
