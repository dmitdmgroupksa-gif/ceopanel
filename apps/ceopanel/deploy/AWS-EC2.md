# EC2 deployment for panel.durar.ai

This deploys the web app, read-only external MCP, PostgreSQL, Redis, worker and
Caddy on one EC2 host. ERPNext continues running at its existing Frappe Cloud
site. No ERP API key, OpenAI key or bridge installation is required for native
ERP browser/MCP reads. Users authenticate with their own ERP account and consent.

## 1. Launch the instance and configure DNS

Use these settings in the EC2 launch wizard:

| Setting | Value |
| --- | --- |
| AMI | Ubuntu Server 24.04 LTS, **64-bit x86 / amd64** |
| Instance | **t3.large**, 2 vCPUs, 8 GiB RAM |
| Purchase | On-Demand for the showcase |
| Disk | **80 GiB gp3, encrypted**, persistent root EBS volume |
| Network | Public subnet with an Internet Gateway and public IPv4 connectivity |
| Address | Allocate and associate an **Elastic IP** |
| Metadata | Require IMDSv2 |
| SSH | Your EC2 key pair; inbound TCP 22 from your own public IP `/32` |
| Web | Inbound TCP 80 and 443 from `0.0.0.0/0`; IPv6 rules only if using IPv6 |
| Other inbound ports | Leave 3000, 5432 and 6379 closed |

Select the company's approved AWS region. `t3.large` is the starting size for a
small showcase/pilot, not a measured capacity guarantee. Monitor memory, CPU
credits and disk usage before increasing usage. Burstable Unlimited CPU credits,
EBS, public IPv4, traffic and snapshots can add to the instance price. Set an AWS
Budget alert and use the calculator for the actual region. This single host is
not a high-availability deployment.

Create a DNS **A record** for `panel.durar.ai` pointing to the Elastic IP. Do not
leave an AAAA record pointing to another server. For the initial connection test,
use direct DNS rather than another HTTP proxy/CDN in front of Caddy.

From Windows PowerShell, connect (the prompts require your real values):

```powershell
$Ec2Address = Read-Host 'EC2 Elastic IP'
$Ec2KeyPath = Read-Host 'Full path to your EC2 .pem key'
ssh -i "$Ec2KeyPath" "ubuntu@$Ec2Address"
```

All remaining commands, except the final download block, run in the **Ubuntu EC2
SSH terminal**. Do not run them in the local Windows terminal.

## 2. Install Docker and operating-system dependencies

```bash
set -euo pipefail
sudo apt-get update
sudo apt-get install -y ca-certificates curl git python3 openssl age dnsutils
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Docker commands below use `sudo`; adding the login user to the root-equivalent
Docker group or reconnecting for group membership is unnecessary.

## 3. Clone the repository and create private configuration

The current repository is public, so the clone requires no GitHub token:

```bash
cd "$HOME"
git clone --depth 1 --branch main --single-branch https://github.com/dmitdmgroupksa-gif/ceopanel.git
cd "$HOME/ceopanel/apps/ceopanel"
bash deploy/configure-ec2.sh panel.durar.ai
```

The setup command creates `deploy/.env` with unique server secrets and
`platform.config.json` with the production environment and no custom write/channel
mappings. It refuses to overwrite existing files or rotate existing database/MCP
secrets. Native reads and external MCP are enabled for the exact ERP role
`Desk User` or `System Manager`, with data restricted by each employee's Frappe
permissions. To use an approved restricted role instead, supply it on the
**first** run:

```bash
bash deploy/configure-ec2.sh panel.durar.ai 'Your exact approved ERP role'
```

Run one setup command, not both. To change the role after setup, use
`nano deploy/.env` and edit `ERP_AI_READ_ROLES`, then recreate web/worker. Keep
the existing generated secrets. Never copy your laptop's `.env.local` to EC2 or
enable anonymous preview. No account receives new native permissions from this
setting. Native Company access and report behavior still need acceptance testing.

Check DNS before requesting certificates:

```bash
dig +short A panel.durar.ai
dig +short AAAA panel.durar.ai
```

The A result must be the instance's Elastic IP. Fix DNS before continuing if it
points elsewhere; allow propagation. No AAAA result is required for IPv4 hosting.

## 4. Build and start the deployment

```bash
cd "$HOME/ceopanel/apps/ceopanel/deploy"
sudo docker compose config --quiet
sudo docker compose build web
sudo docker compose up -d
sudo docker compose ps --all
```

`migrate` must finish with exit code 0. Web/worker start after migrations and
their dependencies. Caddy obtains and renews the HTTPS certificate automatically.
The initial build/certificate issuance can take several minutes. PostgreSQL,
Redis and the web container have no host-published ports. Only Caddy publishes
80/443. Persistent volumes hold the platform data, private documents and TLS state;
container logs rotate instead of growing without a bound.

## 5. Verify HTTPS, readiness, authentication and MCP discovery

```bash
cd "$HOME/ceopanel/apps/ceopanel/deploy"
sudo docker compose ps --all
curl --fail --show-error --silent https://panel.durar.ai/api/platform/health
curl --fail --show-error --silent https://panel.durar.ai/.well-known/oauth-authorization-server
curl --fail --show-error --silent https://panel.durar.ai/.well-known/oauth-protected-resource/api/mcp
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://panel.durar.ai/api/mcp
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://panel.durar.ai/api/erp/explorer --request POST --header 'Content-Type: application/json' --header 'Origin: https://panel.durar.ai' --data '{"action":"sources"}'
```

Expected: health returns `{"ready":true}`; metadata uses the **HTTPS production
origin**, PKCE `S256` and read scopes; unauthenticated MCP and Explorer requests
return **401**. Do not disable authentication or use `curl -k` to make these pass.

If services fail, inspect local logs without publishing their contents:

```bash
sudo docker compose logs --tail=100 migrate
sudo docker compose logs --tail=100 web
sudo docker compose logs --tail=100 worker
sudo docker compose logs --tail=100 proxy
```

Open `https://panel.durar.ai/login`, sign in with an actual ERP account, and
compare a known report with ERP. Try the Explorer and daily briefing. Confirm a
restricted account cannot read prohibited data. Do not test write actions in ERP.

## 6. Connect ChatGPT

For personal native Frappe login, complete the one-time
[Frappe OAuth Client setup](FRAPPE-OAUTH.md). Existing ERP login sessions remain
supported while that client is unconfigured.

In ChatGPT's custom MCP connection form use:

| Field | Value |
| --- | --- |
| Name | Durar ERP |
| MCP URL | `https://panel.durar.ai/api/mcp` |
| Authentication | OAuth, using discovered endpoints and dynamic client registration |
| Read scopes | `ceopanel:read ceopanel:erp-read` |

Complete ERP sign-in and consent through the app. Use the actual redirect URI
registered by ChatGPT; do not invent a callback or paste a Frappe API secret into
ChatGPT. No manually created client secret is required by this public PKCE client.
Refresh tool metadata after a server change and start a new conversation.

Rehearse source discovery, one filtered quotation, its workflow and a narrowly
filtered **Stock Balance** report before trying exports. Verify PDF/spreadsheet
presentation in ChatGPT, then test denied access and revoke the connection through
**Integration setup → MCP connections**. See
[MCP-SHOWCASE-REVIEW.md](../MCP-SHOWCASE-REVIEW.md) for the verified tool behavior.

## 7. Backups before ongoing use or updates

Create an encryption identity once on EC2, then save an off-host private copy:

```bash
umask 077
mkdir -p "$HOME/.config/ceopanel"
if [ ! -f "$HOME/.config/ceopanel/backup-identity.txt" ]; then
  age-keygen -o "$HOME/.config/ceopanel/backup-identity.txt"
fi
cd "$HOME/ceopanel/apps/ceopanel/deploy"
export BACKUP_RECIPIENT
BACKUP_RECIPIENT=$(age-keygen -y "$HOME/.config/ceopanel/backup-identity.txt")
sudo --preserve-env=BACKUP_RECIPIENT bash backup.sh
sudo chown -R "$(id -u):$(id -g)" "$HOME/ceopanel/apps/ceopanel/deploy/backups"
```

Download backups and the identity from **Windows PowerShell**, using the
`$Ec2Address` and `$Ec2KeyPath` values from step 1:

```powershell
New-Item -ItemType Directory -Force "$HOME/ceopanel-backups", "$HOME/ceopanel-recovery-key" | Out-Null
scp -i "$Ec2KeyPath" -r "ubuntu@${Ec2Address}:ceopanel/apps/ceopanel/deploy/backups/." "$HOME/ceopanel-backups/"
scp -i "$Ec2KeyPath" "ubuntu@${Ec2Address}:.config/ceopanel/backup-identity.txt" "$HOME/ceopanel-recovery-key/"
scp -i "$Ec2KeyPath" "ubuntu@${Ec2Address}:ceopanel/apps/ceopanel/deploy/.env" "$HOME/ceopanel-recovery-key/server.env"
scp -i "$Ec2KeyPath" "ubuntu@${Ec2Address}:ceopanel/apps/ceopanel/platform.config.json" "$HOME/ceopanel-recovery-key/"
```

These are private recovery files. Move the identity/configuration into approved
secure storage separately from encrypted archives; never put either folder in
Git. Schedule encrypted off-host backups and EBS snapshots before ongoing use.
Test restoring into an isolated deployment using [the recovery instructions](README.md).
A backup left only on the EC2 volume does not protect against losing the instance.

## 8. Update and restart commands

Take/download a backup first. Then, on EC2:

```bash
cd "$HOME/ceopanel"
git pull --ff-only origin main
cd apps/ceopanel/deploy
sudo docker compose build web
sudo docker compose stop web worker
sudo docker compose run --rm migrate
sudo docker compose up -d
sudo docker compose ps --all
curl --fail --show-error --silent https://panel.durar.ai/api/platform/health
```

For an environment-only change (preserving secrets):

```bash
cd "$HOME/ceopanel/apps/ceopanel/deploy"
sudo docker compose up -d --force-recreate web worker
```

Do not use `docker compose down -v` or prune volumes: they contain the platform
database and persistent files. Replacing the EC2 host requires a verified restore,
not only another Git clone. Moving to multiple app hosts needs shared database,
queues, private storage, keys and deployment acceptance; this guide covers one host.

References: [AWS T3 specifications](https://aws.amazon.com/ec2/instance-types/t3/),
[EC2 security group rules](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html),
[Elastic IP](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html),
[Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Validated locally on 17 October 2026: clean Linux image build, production
dependency audit (zero vulnerabilities), configuration validation/permissions/
no-overwrite checks, fresh disposable PostgreSQL/Redis migrations, web/worker
startup, readiness, HTTPS OAuth issuer metadata, unauthenticated MCP rejection,
packaged PDF fonts and Caddy configuration. No AWS instance or DNS change was
made by these checks; real certificate issuance and ChatGPT acceptance follow
the operator steps above.
