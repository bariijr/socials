# MikoPBX — Deployment Guide

## Prerequisites

- Docker + Docker Compose installed on VPS
- Nginx Proxy Manager running on the `web-proxy` external network
- `web-proxy` network already created: `docker network create web-proxy`
- VPS firewall open for: UDP 5060, TCP 5060, TCP 5061, UDP 10000-10200

---

## 1. First-Time Setup

```bash
# Clone / copy project files to VPS
cd /opt/mikopbx

# Create .env from example
cp .env.example .env
nano .env    # Fill in HOST_IP, HOSTNAME, EXTERNAL_IP, TZ

# Create backup directory
mkdir -p /var/backups/$(hostname)/mikopbx

# Pull the image
docker compose pull

# Start the stack
docker compose up -d

# Verify container is running
docker compose ps
docker compose logs -f mikopbx
```

---

## 2. Nginx Proxy Manager — Proxy Host Setup

After the container starts, add a proxy host in NPM:

| Field                    | Value                              |
|--------------------------|------------------------------------|
| **Domain Names**         | `pbx.insider.co.tz`              |
| **Scheme**               | `http`                             |
| **Forward Hostname/IP**  | `mikopbx_app`                     |
| **Forward Port**         | `80`                               |
| **Websockets Support**   | ✅ Enable                          |
| **SSL Certificate**      | Let's Encrypt (request new)        |
| **Force SSL**            | ✅ Enable                          |
| **HTTP/2 Support**       | ✅ Enable                          |

> The container name `mikopbx_app` is resolvable inside the `web-proxy` network.
> NPM must also be on the `web-proxy` network.

---

## 3. MikoPBX Admin — Required Settings After First Login

Default admin URL (before NPM): `http://<VPS_IP>:80`
Default credentials: `admin` / `admin` (change immediately)

### Network Settings (`System → Network`)
- **External IP**: Set to your VPS public IP
- **Internal network**: Set to your VPS LAN subnet
- **SIP port**: 5060
- **RTP port range**: 10000 – 10200

### SSL (after NPM proxy is active)
- Enable HTTPS in `System → General Settings`
- Set the domain to match your NPM proxy host

---

## 4. Firewall Rules (UFW / iptables)

```bash
# SIP signaling
ufw allow 5060/udp
ufw allow 5060/tcp
ufw allow 5061/tcp

# RTP media streams
ufw allow 10000:10200/udp

# SSH admin console (localhost only — already bound in docker-compose)
# No external rule needed for port 2222
```

---

## 5. Automated Backups

```bash
# Make backup script executable
chmod +x /opt/mikopbx/backup/backup.sh

# Add to crontab (runs daily at 02:00)
crontab -e
# Add:  0 2 * * * /opt/mikopbx/backup/backup.sh
```

---

## 6. Development Mode

```bash
# Access web UI directly on port 8080 (no NPM needed)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Open: http://localhost:4001
```

---

## 7. Upgrade

```bash
docker compose pull
docker compose up -d --force-recreate
```

---

## 8. Rollback

```bash
# Pin to a specific version in docker-compose.yml
# image: ghcr.io/mikopbx/mikopbx-x86-64:2024.x.xxx

# Restore volumes from backup
docker run --rm \
  -v mikopbx_cf:/dest \
  -v /var/backups/$(hostname)/mikopbx:/src \
  alpine tar xzf /src/mikopbx_cf_YYYYMMDD_HHMMSS.tar.gz -C /dest
```

---

## 9. Health Check

```bash
# Container status
docker compose ps

# Web UI reachable
curl -I http://mikopbx_app:80    # from inside web-proxy network

# SIP port open
nc -vzu <VPS_IP> 5060

# View logs
docker compose logs --tail=100 -f mikopbx
```
