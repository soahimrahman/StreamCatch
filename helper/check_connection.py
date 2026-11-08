#!/usr/bin/env python3
"""User-initiated diagnostics for HTTPS reachability, not a proxy or bypass."""
import socket
import ssl
from urllib.parse import urlsplit


def main():
    text = input('Enter the video website URL or domain (not your password): ').strip()
    if not text:
        print('No website entered.')
        return
    try:
        parts = urlsplit(text if '://' in text else 'https://' + text)
        host = parts.hostname
        if not host or len(host) > 253 or '/' in host:
            raise ValueError('Invalid domain')
        print('\nChecking', host + ':443', '(HTTPS) ...')
        resolved = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        addrs = sorted({str(item[4][0]) for item in resolved})
        print('DNS: OK —', ', '.join(addrs[:4]))
        with socket.create_connection((host, 443), timeout=12) as conn:
            print('TCP port 443: OK')
            context = ssl.create_default_context()
            with context.wrap_socket(conn, server_hostname=host) as tls:
                print('TLS HTTPS: OK —', tls.version())
        print('\nThe website is reachable from this PC. If StreamCatch still fails, review its job details; a site can still reject yt-dlp.')
    except (OSError, ValueError, ssl.SSLError) as error:
        print('\nConnection test failed:', error)
        print('This is a connection problem outside MP4 conversion. Check site availability, DNS, network firewall and Internet connectivity.')


if __name__ == '__main__':
    main()
