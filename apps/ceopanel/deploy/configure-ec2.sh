#!/usr/bin/env bash
set -euo pipefail
umask 077
deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ $# -lt 1 || $# -gt 2 ]]; then
  printf 'Usage: bash configure-ec2.sh panel.durar.ai ["Approved ERP role,Another role"]\n' >&2
  exit 1
fi
command -v python3 >/dev/null
python3 - "$deploy_dir" "$1" "${2:-Desk User,System Manager}" <<'PY'
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import sys

deployment = Path(sys.argv[1]).resolve()
host = sys.argv[2].lower()
roles = sys.argv[3]
labels = host.split('.')
if len(labels) < 2 or len(host) > 253 or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in labels) or labels[-1] in ('invalid', 'localhost', 'local'):
    raise SystemExit('Enter a DNS hostname only, without https://, a port or a path.')
try:
    ipaddress.ip_address(host)
except ValueError:
    pass
else:
    raise SystemExit('Use the public DNS hostname for HTTPS, not an IP address.')
if not roles.strip() or len(roles) > 500 or any(ord(c) < 32 for c in roles) or any(not role.strip() for role in roles.split(',')):
    raise SystemExit('Enter exact approved ERP roles as a comma-separated list.')
env_path = deployment / '.env'
config_path = deployment.parent / 'platform.config.json'
if env_path.exists() or config_path.exists():
    raise SystemExit('Configuration already exists. No files or secrets were overwritten; edit the existing configuration instead.')
env = {
    'PUBLIC_HOST': host,
    'POSTGRES_PASSWORD': secrets.token_hex(32),
    'CEOPANEL_ORIGIN': 'https://' + host,
    'CEOPANEL_DISABLE_AUTH': 'false',
    'ERPNEXT_URL': 'https://dmgroup.frappe.cloud',
    'ERPNEXT_COMPANY': 'Durar Masagh Trading Company',
    'COMPANY_NAME': 'Durar Masagh',
    'BUSINESS_TIMEZONE': 'Asia/Riyadh',
    'ERP_AI_READ_ENABLED': 'true',
    'ERP_AI_READ_ROLES': ','.join(role.strip() for role in roles.split(',')),
    'OPENAI_API_KEY': '',
    'OPENAI_MODEL': '',
    'OPENAI_EMBEDDING_MODEL': '',
    'ERPNEXT_WEBHOOK_SECRET': secrets.token_hex(32),
    'ERPNEXT_RECEIPT_SECRET': secrets.token_hex(32),
    'MCP_EXTERNAL_ENABLED': 'true',
    'MCP_AUTH_SECRET': secrets.token_hex(32),
    'MCP_CLIENT_ORIGINS': '',
    'MCP_DISABLED_PLUGINS': '',
}
config = {'environment': 'production', 'aiDataApproved': False,
          'modules': [], 'agents': {}, 'reports': [], 'collections': [],
          'channels': {'email': False, 'whatsapp': False, 'voice': False}}
created = []
try:
    for path, content, mode in [
        (env_path, ''.join(key + "='" + value.replace("'", "\\'") + "'\n" for key, value in env.items()), 0o600),
        (config_path, json.dumps(config, indent=2) + '\n', 0o644),
    ]:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        created.append(path)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(content)
        os.chmod(path, mode)
except Exception:
    for path in created:
        path.unlink(missing_ok=True)
    raise SystemExit('Configuration could not be written. Newly created files were removed; no existing file was replaced.')
print('Created private server environment and production mapping configuration. Secret values were not printed.')
print('Native ERP reads and read-only external MCP are enabled for the specified roles. ERP write operations remain disabled in code.')
print('Next: verify DNS, build the container, run migrations and start the services using AWS-EC2.md.')
PY
