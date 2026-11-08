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

const py = findPython();
if (!py) {
  console.error('\n❌ Python 3 was not found on your system.');
  console.error('Please install Python 3.8+ from https://www.python.org/downloads/ (check "Add to PATH").\n');
  process.exit(1);
}

const serverPath = path.resolve(__dirname, '..', 'helper', 'server.py');
const extraArgs = process.argv.slice(2);
const runArgs = [...py.prefix, serverPath, ...extraArgs];

const res = spawnSync(py.bin, runArgs, { stdio: 'inherit', windowsHide: false });
process.exit(res ? (res.status || 0) : 0);
