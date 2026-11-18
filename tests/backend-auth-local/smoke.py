#!/usr/bin/env python3
"""Bootstrap smoke only. The separate 05 assertions are still required."""
import json
import os
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

status = json.load(open(os.environ['RMG_LOCAL_STATUS_FILE'], encoding='utf-8'))
for key in ('API_URL', 'MAILPIT_URL'):
    endpoint = urlsplit(status[key])
    if endpoint.scheme != 'http' or endpoint.hostname != '127.0.0.1':
        raise SystemExit('Refusing a non-local endpoint')
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = build_opener(ProxyHandler({}), NoRedirect())
for label, url, headers in (
    ('Auth', status['API_URL'] + '/auth/v1/health', {'apikey': status['ANON_KEY']}),
    ('PostgREST', status['API_URL'] + '/rest/v1/', {'apikey': status['ANON_KEY']}),
    ('Mailpit', status['MAILPIT_URL'] + '/api/v1/messages', {}),
):
    with opener.open(Request(url, headers=headers), timeout=10) as response:
        if response.status != 200:
            raise SystemExit(label + ' did not return 200')
    print(label + ' local health request: HTTP 200')
