# MikoPBX — Docker + Nginx Proxy Manager

Self-hosted PBX phone system (FreeBSD + Asterisk) deployed via Docker Compose with Nginx Proxy Manager for web admin access.

## Quick Start

```bash
cp .env.example .env
# Edit .env — set HOST_IP, EXTERNAL_IP, HOSTNAME, TZ
docker compose pull
docker compose up -d
```

## Network Architecture

| Traffic Type   | Route                                      |
|----------------|--------------------------------------------|
| Web Admin UI   | NPM → `pbx.insider.co.tz` → `mikopbx_app:80` |
| SIP Signaling  | Direct host port 5060 (UDP/TCP)            |
| SIP/TLS        | Direct host port 5061 (TCP)                |
| RTP Media      | Direct host ports 10000–10200 (UDP)        |
| SSH Console    | `localhost:2222` only                       |

## NPM Proxy Host

Forward to: `http://mikopbx_app:80`
Enable: Websockets, Force SSL, HTTP/2

See [DEPLOYMENT.md](DEPLOYMENT.md) for full setup instructions.

## Firewall

```bash
ufw allow 5060/udp && ufw allow 5060/tcp
ufw allow 5061/tcp
ufw allow 10000:10200/udp
```

## Backup

```bash
chmod +x backup/backup.sh
# Cron: 0 2 * * * /opt/mikopbx/backup/backup.sh
```
