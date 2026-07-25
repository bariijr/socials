# MikoPBX — Deployment Guide

## Prerequisites

- Docker + Docker Compose installed on VPS
- Nginx Proxy Manager running and connected to `web-proxy` network
- `web-proxy` network created: `docker network create web-proxy`
- VPS firewall open for: UDP 5060, TCP 5060, TCP 5061, UDP 10000-10200

---

## 1. First-Time Setup

```bash
# Copy project files to VPS
scp -r mikoPBX/ root@107.174.35.100:/opt/mikoPBX

# SSH into VPS
ssh root@107.174.35.100
cd /opt/mikoPBX

# Create .env
cp .env.example .env
# .env is pre-filled — verify HOST_IP and EXTERNAL_IP are 107.174.35.100

# Create backup directory
mkdir -p /var/backups/$(hostname)/mikopbx

# Pull the image
docker compose pull

# Start the stack
docker compose up -d

# Watch boot — MikoPBX takes 60-90s (FreeBSD init)
docker logs -f mikopbx_app
```

---

## 2. Nginx Proxy Manager — Proxy Host Setup

Add a proxy host in NPM (`http://107.174.35.100:81`):

| Field                   | Value                     |
|-------------------------|---------------------------|
| **Domain Names**        | `pbx.insider.co.tz`       |
| **Scheme**              | `http`                    |
| **Forward Hostname/IP** | `107.174.35.100`          |
| **Forward Port**        | `4000`                    |
| **Websockets Support**  | ✅ Enable                  |
| **SSL Certificate**     | Let's Encrypt (request new)|
| **Force SSL**           | ✅ Enable                  |
| **HTTP/2 Support**      | ✅ Enable                  |

---

## 3. MikoPBX Admin — Required Settings After First Login

Default admin URL: `http://107.174.35.100:4000`
Default credentials: `admin` / `admin` — **change immediately**

### Network Settings (`System → Network`)
- **External IP**: `107.174.35.100`
- **SIP port**: `5060`
- **RTP port range**: `10000 – 10200`

### SSL (after NPM proxy active)
- Set domain to `pbx.insider.co.tz` in `System → General Settings`

---

## 4. Firewall Rules

```bash
ufw allow 5060/udp
ufw allow 5060/tcp
ufw allow 5061/tcp
ufw allow 10000:10200/udp
# Port 4000 accessible only from NPM on same host — no external UFW rule needed
```

---

## 5. Automated Backups

```bash
chmod +x /opt/mikoPBX/backup/backup.sh
crontab -e
# Add: 0 2 * * * /opt/mikoPBX/backup/backup.sh
```

---

## 6. Development Mode

```bash
# Expose web UI on port 4001 locally (no NPM needed)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Open: http://localhost:4001
```

---

## 7. Clean Rebuild (removes all data)

```bash
docker compose down
docker volume rm mikopbx_cf mikopbx_storage
docker rmi ghcr.io/mikopbx/mikopbx-x86-64:latest
docker compose pull
docker compose up -d
docker logs -f mikopbx_app
```

---

## 8. Upgrade

```bash
docker compose pull
docker compose up -d --force-recreate
```

---

## 9. Rollback

```bash
# Pin version in docker-compose.yml:
# image: ghcr.io/mikopbx/mikopbx-x86-64:2024.x.xxx

# Restore config volume from backup
docker run --rm \
  -v mikopbx_cf:/dest \
  -v /var/backups/$(hostname)/mikopbx:/src \
  alpine tar xzf /src/mikopbx_cf_YYYYMMDD_HHMMSS.tar.gz -C /dest
```

---

## 10. Health Check

```bash
# Container running?
docker compose ps

# Port 4000 bound on host?
ss -tlnp | grep 4000

# Web UI responding?
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000

# SIP port open?
nc -vzu 107.174.35.100 5060

# Logs
docker compose logs --tail=100 -f mikopbx_app
```
