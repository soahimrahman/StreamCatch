#!/usr/bin/env python3
import json
from pathlib import Path
import struct
import subprocess
import sys

def main():
    try:
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length:
            return
        message_length = struct.unpack('<I', raw_length)[0]
        raw_message = sys.stdin.buffer.read(message_length).decode('utf-8')
        data = json.loads(raw_message) if raw_message else {}

        # Launch the silent runner detached
        helper_dir = Path(__file__).resolve().parent
        vbs_path = helper_dir / 'start_silent.vbs'
        if vbs_path.exists():
            subprocess.Popen(['wscript.exe', str(vbs_path)], close_fds=True)

        reply = json.dumps({'ok': True, 'action': 'started', 'port': 8735}).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('<I', len(reply)))
        sys.stdout.buffer.write(reply)
        sys.stdout.buffer.flush()
    except Exception as err:
        try:
            err_reply = json.dumps({'ok': False, 'error': str(err)}).encode('utf-8')
            sys.stdout.buffer.write(struct.pack('<I', len(err_reply)))
            sys.stdout.buffer.write(err_reply)
            sys.stdout.buffer.flush()
        except Exception:
            pass

if __name__ == '__main__':
    main()
