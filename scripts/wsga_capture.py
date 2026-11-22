#!/usr/bin/env python3
"""Capture the single WSGA page only after an accessible robots.txt permits it."""
import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

HOST = 'waguidesassociation.org'
ROBOTS = 'https://' + HOST + '/robots.txt'
PAGE = 'https://' + HOST + '/our-members/'
AGENT = 'RateMyGuidePNW-Research'
LIMIT = 4_000_000


class SameHostHTTPS(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urlparse(newurl)
        if u.scheme != 'https' or u.hostname != HOST or u.port not in (None, 443):
            raise ValueError('redirect outside HTTPS source host')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, opener):
    req = Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,text/plain;q=0.9'})
    with opener.open(req, timeout=20) as response:
        if response.status != 200: raise ValueError('non-200 source response')
        data = response.read(LIMIT + 1)
        if len(data) > LIMIT: raise ValueError('response too large')
        return data


def capture(output, opener=None, wait=time.sleep, *, terms_reviewed=False):
    if not terms_reviewed: raise ValueError('site terms must be reviewed before capture')
    opener = opener or build_opener(SameHostHTTPS())
    # No retries and no fallback if robots is missing, blocked, or unreadable.
    robots_bytes = fetch(ROBOTS, opener)
    robots_text = robots_bytes.decode('utf-8-sig', errors='strict')
    if not re.search(r'^\s*user-agent\s*:', robots_text, re.I | re.M):
        raise ValueError('robots response has no recognizable user-agent directive')
    robots = RobotFileParser(); robots.set_url(ROBOTS); robots.parse(robots_text.splitlines())
    if not robots.can_fetch(AGENT, PAGE): raise ValueError('robots.txt disallows member page')
    delay = max(2, robots.crawl_delay(AGENT) or 0)
    if delay > 60: raise ValueError('robots crawl-delay exceeds bounded capture limit')
    wait(delay)
    html = fetch(PAGE, opener)
    captured = datetime.now(timezone.utc).isoformat()
    out = Path(output); out.mkdir(parents=True, exist_ok=False, mode=0o700)
    (out/'robots.txt').write_bytes(robots_bytes)
    (out/'members.html').write_bytes(html)
    (out/'capture.json').write_text(json.dumps({'source_url':PAGE,'captured_at':captured,'sha256':hashlib.sha256(html).hexdigest(),'robots_sha256':hashlib.sha256(robots_bytes).hexdigest(),'user_agent':AGENT,'robots_delay_seconds':delay,'terms_reviewed':True},indent=2)+'\n')
    return captured


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', required=True, help='new private directory')
    p.add_argument('--terms-reviewed', action='store_true', required=True, help='operator has reviewed applicable site terms')
    args = p.parse_args()
    print('Captured at', capture(args.out, terms_reviewed=args.terms_reviewed))


if __name__ == '__main__': main()
