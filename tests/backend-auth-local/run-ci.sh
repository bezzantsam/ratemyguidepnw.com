#!/usr/bin/env bash
# Only for an ephemeral GitHub-hosted runner. Never point at an existing project.
set -euo pipefail
set +x
umask 077
[[ "${RUNNER_ENVIRONMENT:-}" == github-hosted && -n "${RUNNER_TEMP:-}" && -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_ATTEMPT:-}" ]] || { echo 'Requires a disposable GitHub-hosted runner.' >&2; exit 1; }
[[ $# == 1 && -f "$1" ]] || { echo 'Usage: bash tests/backend-auth-local/run-ci.sh /absolute/path/to/05-assertions.py' >&2; exit 1; }
assertions=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
root=$(cd "$(dirname "$0")/../.." && pwd)
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Pinned CLI requires Linux x86_64.' >&2; exit 1; }
command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo 'Docker runtime unavailable.' >&2; exit 1; }
df -h "$RUNNER_TEMP"
docker_root=$(docker info --format '{{.DockerRootDir}}')
df -h "$docker_root"
available=$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')
[[ "$available" =~ ^[0-9]+$ && "$available" -ge 8388608 ]] || { echo 'Docker filesystem needs at least 8 GiB free before image pulls.' >&2; exit 1; }
available_temp=$(df -Pk "$RUNNER_TEMP" | awk 'NR==2 {print $4}')
[[ "$available_temp" =~ ^[0-9]+$ && "$available_temp" -ge 1048576 ]] || { echo 'Runner temp needs at least 1 GiB free.' >&2; exit 1; }
work=$(mktemp -d "$RUNNER_TEMP/rmg-auth-06.XXXXXXXX")
project="rmgqa${GITHUB_RUN_ID}${GITHUB_RUN_ATTEMPT}"
[[ "$project" =~ ^rmgqa[0-9]+$ ]] || exit 1
cd "$work"
curl --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 180 'https://github.com/supabase/cli/releases/download/v3.2.0/supabase_3.2.0_linux_amd64.tar.gz' -o cli.tar.gz
printf '%s  %s\n' fb88b175a817563505be02c60872060bcb8d5c869a1aa5656eaeb085d4a2f1e4 cli.tar.gz | sha256sum --check --status || { echo 'Pinned CLI checksum failed.' >&2; exit 1; }
mkdir bin
tar -xzf cli.tar.gz -C bin supabase
cli="$work/bin/supabase"
[[ "$($cli --version)" == 3.2.0 ]] || { echo 'Unexpected CLI version.' >&2; exit 1; }
# Inherit only the minimum required for the local Docker runtime: no hosted token or DB URL.
clean=(env -i "PATH=$PATH" "HOME=$HOME" "TMPDIR=$work")
"${clean[@]}" "$cli" init > init.log 2>&1 || { echo 'Local Supabase init failed; inspect private runner log.' >&2; exit 1; }
python3 - "$project" <<'PY'
from pathlib import Path
import re, sys, tomllib
p=Path('supabase/config.toml'); s=p.read_text()
def change(pattern, replacement):
    global s
    s,n=re.subn(pattern,replacement,s,flags=re.M)
    if n != 1: raise SystemExit('Unexpected Supabase config template; refusing to continue')
change(r'^project_id\s*=.*$', 'project_id = "'+sys.argv[1]+'"')
change(r'^site_url\s*=.*$', 'site_url = "http://127.0.0.1:3000"')
change(r'^additional_redirect_urls\s*=.*$', 'additional_redirect_urls = ["http://127.0.0.1:3000/**"]')
# Only the disposable local Mailpit fixture needs four synthetic confirmations.
change(r'^email_sent\s*=.*$', 'email_sent = 20')
match=re.search(r'(?ms)^\[auth\.email\]\s*\n(?P<body>.*?)(?=^\[|\Z)',s)
if not match: raise SystemExit('Missing auth.email config')
body,n=re.subn(r'^enable_confirmations\s*=.*$', 'enable_confirmations = true', match['body'], flags=re.M)
if n != 1: raise SystemExit('Missing confirmation setting')
s=s[:match.start('body')]+body+s[match.end('body'):]
c=tomllib.loads(s)
if c['project_id'] != sys.argv[1] or not c['auth']['email']['enable_confirmations'] or c['auth']['rate_limit']['email_sent'] != 20: raise SystemExit('Config verification failed')
p.write_text(s)
PY
if ! "${clean[@]}" "$cli" start -x realtime,storage-api,imgproxy,edge-runtime,postgres-meta,studio,logflare,vector,supavisor > start.log 2>&1; then
  # Emit only a fixed category: the CLI log can contain local credentials.
  python3 - <<'PY'
from pathlib import Path
s=Path('start.log').read_text(errors='replace').lower()
checks=(('dns or image registry/network',('no such host','lookup ','connection refused','tls handshake','pull access denied','rate limit')),
        ('Docker service/container',('docker daemon','container exited','unhealthy','health check')),
        ('local port conflict',('address already in use','port is already allocated')),
        ('CLI configuration',('invalid config','config.toml','invalidjwt')))
found=[name for name,terms in checks if any(term in s for term in terms)]
print('Local stack start failed; diagnostic category: '+(', '.join(found) if found else 'unclassified CLI start failure'))
PY
  exit 1
fi
"${clean[@]}" "$cli" status -o json > status.json 2> status.log || { echo 'Local stack status failed.' >&2; exit 1; }
python3 "$root/tests/backend-auth-local/prepare.py" "$work"
# 05 receives the local CLI status privately via a file, never as a log or artifact.
RMG_LOCAL_STATUS_FILE="$work/status.json" RMG_LOCAL_PROJECT="$project" RMG_LOCAL_CLI="$cli" RMG_LOCAL_WORKDIR="$work" python3 "$assertions"
echo 'Selected local Auth/PostgREST check completed successfully.'
