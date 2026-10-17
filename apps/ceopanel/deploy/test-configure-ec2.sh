#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test_base=$(mktemp -d)
trap 'rm -f -- "$test_base/app/deploy/.env" "$test_base/app/platform.config.json" "$test_base/app/deploy/configure-ec2.sh"; rmdir -- "$test_base/app/deploy" "$test_base/app" "$test_base"' EXIT
mkdir -p "$test_base/app/deploy"
cp -- "$script_dir/configure-ec2.sh" "$test_base/app/deploy/configure-ec2.sh"
setup="$test_base/app/deploy/configure-ec2.sh"
for invalid in 'https://panel.example' '127.0.0.1' 'localhost' 'panel.example/path' 'panel.example:443' 'bad..example'; do
  if bash "$setup" "$invalid" >/dev/null 2>&1; then
    printf 'Invalid hostname was accepted.\n' >&2
    exit 1
  fi
done
if bash "$setup" panel.example $'Role\nFORGED=true' >/dev/null 2>&1; then
  printf 'Unsafe role input was accepted.\n' >&2
  exit 1
fi
bash "$setup" panel.example 'ERP Reader' >/dev/null
python3 - "$test_base/app" <<'PY'
import json, os, re, sys
from pathlib import Path
app = Path(sys.argv[1])
env_file = app / 'deploy/.env'
config_file = app / 'platform.config.json'
assert env_file.stat().st_mode & 0o777 == 0o600
assert config_file.stat().st_mode & 0o777 == 0o644
env = dict(line.split('=', 1) for line in env_file.read_text().splitlines())
assert env['PUBLIC_HOST'] == "'panel.example'"
assert env['ERP_AI_READ_ROLES'] == "'ERP Reader'"
assert env['CEOPANEL_DISABLE_AUTH'] == "'false'"
assert env['MCP_EXTERNAL_ENABLED'] == "'true'"
assert env['ERP_AI_READ_ENABLED'] == "'true'"
for key in ['POSTGRES_PASSWORD', 'MCP_AUTH_SECRET', 'ERPNEXT_WEBHOOK_SECRET', 'ERPNEXT_RECEIPT_SECRET']:
    assert re.fullmatch("'[a-f0-9]{64}'", env[key])
config = json.loads(config_file.read_text())
assert config['environment'] == 'production'
assert config['aiDataApproved'] is False
assert not any(config['channels'].values())
PY
before=$(sha256sum "$test_base/app/deploy/.env" "$test_base/app/platform.config.json")
if bash "$setup" another.example >/dev/null 2>&1; then
  printf 'Existing configuration was overwritten.\n' >&2
  exit 1
fi
[[ "$before" == "$(sha256sum "$test_base/app/deploy/.env" "$test_base/app/platform.config.json")" ]]
printf 'EC2 configuration validation, private permissions and no-overwrite checks passed.\n'
