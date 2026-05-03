# Pounds MFI — Deployment Guide

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Next.js     │───▶│  NestJS API  │───▶│  PostgreSQL  │
│  Frontend    │    │  Backend     │    │  Database    │
│  :3000       │    │  :3001       │    │  :5432       │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                    ┌──────▼───────┐
                    │    Redis     │
                    │  Queue/Cache │
                    │  :6379       │
                    └──────────────┘
```

Both frontend and backend sit behind a reverse proxy (Nginx or Traefik).
All inter-service communication is on the internal Docker network.

---

## Prerequisites

- Docker ≥ 24 and Docker Compose ≥ 2.20
- A reverse proxy on the host (Nginx or Traefik) with an external Docker network named `web-proxy`
- Domain name with DNS A-record pointing to the server
- SSL certificate (Let's Encrypt via Certbot or Traefik's ACME)

---

## 1. Clone & Configure

```bash
git clone <your-repo-url> pounds_mfi
cd pounds_mfi

cp .env.example .env
nano .env   # fill in every value — see section below
```

### Required .env values

| Variable | Description |
|---|---|
| `JWT_SECRET` | Min 32 random chars — use `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Different 32-char secret — use `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Exactly 32 chars — use `openssl rand -hex 16` |
| `DB_PASSWORD` | Strong PostgreSQL password |
| `REDIS_PASSWORD` | Strong Redis password |
| `SMTP_HOST/USER/PASS` | Your mail server credentials |
| `APP_URL` | Your public domain e.g. `https://mfi.yourdomain.com` |
| `API_URL` | `https://mfi.yourdomain.com` (frontend uses `/api/v1` prefix) |
| `BRAND_NAME` | Your company name |

---

## 2. Create the External Docker Network

This only needs to be done once per host:

```bash
docker network create web-proxy
```

---

## 3. Build & Start

```bash
# Build images (first time, or after code changes)
docker compose build --no-cache

# Start all services
docker compose up -d

# Watch logs
docker compose logs -f backend
docker compose logs -f frontend
```

---

## 4. Run Database Migration

The migration creates all tables. Run it once after the first `up`:

```bash
docker compose exec backend npm run migration:run
```

Verify the migration completed:

```bash
docker compose exec backend node -e "console.log('Migration OK')"
```

---

## 5. Seed Initial Users

Creates default admin accounts. **Run only once on a fresh database.**

```bash
docker compose exec backend npm run seed
```

Default credentials (change passwords immediately after first login):

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@pounds.mfi` | `Admin@123456` |
| Admin | `admin@pounds.mfi` | `Admin@123456` |
| Loan Officer | `officer@pounds.mfi` | `Admin@123456` |

**Change all passwords via Profile → Security tab immediately.**

---

## 6. Configure Reverse Proxy

### Option A: Nginx

```nginx
# /etc/nginx/sites-available/pounds-mfi
server {
    listen 80;
    server_name mfi.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mfi.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/mfi.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mfi.yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/pounds-mfi /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL with Certbot
certbot --nginx -d mfi.yourdomain.com
```

### Option B: Traefik (docker-compose labels)

Add labels to the `frontend` and `backend` services in `docker-compose.yml`:

```yaml
# frontend service
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.mfi-frontend.rule=Host(`mfi.yourdomain.com`)"
  - "traefik.http.routers.mfi-frontend.entrypoints=websecure"
  - "traefik.http.routers.mfi-frontend.tls.certresolver=letsencrypt"
  - "traefik.http.services.mfi-frontend.loadbalancer.server.port=3000"

# backend service
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.mfi-api.rule=Host(`mfi.yourdomain.com`) && PathPrefix(`/api`)"
  - "traefik.http.routers.mfi-api.entrypoints=websecure"
  - "traefik.http.routers.mfi-api.tls.certresolver=letsencrypt"
  - "traefik.http.services.mfi-api.loadbalancer.server.port=3001"
```

---

## 7. Expose Ports (if not using Traefik)

If your reverse proxy runs on the host (Nginx), publish the ports from docker-compose:

```yaml
# In docker-compose.yml, add to frontend and backend:
frontend:
  ports:
    - "127.0.0.1:3000:3000"

backend:
  ports:
    - "127.0.0.1:3001:3001"
```

Bind to `127.0.0.1` to avoid direct internet exposure.

---

## 8. Verify Health

```bash
# Backend health
curl https://mfi.yourdomain.com/health

# Frontend
curl -I https://mfi.yourdomain.com

# Check all containers are running
docker compose ps
```

---

## Updates & Redeployment

```bash
git pull

# Rebuild only changed services
docker compose build --no-cache backend  # or frontend

# Rolling restart (zero-downtime)
docker compose up -d --no-deps backend
docker compose up -d --no-deps frontend

# Run new migrations if any
docker compose exec backend npm run migration:run
```

---

## Backup & Recovery

### Manual backup

```bash
docker compose exec backend npm run backup   # triggers API backup
# OR directly via pg_dump:
docker compose exec postgres pg_dump \
  -U $DB_USERNAME $DB_NAME | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore from backup

```bash
gunzip -c backup_20240101.sql.gz | \
  docker compose exec -T postgres psql -U $DB_USERNAME $DB_NAME
```

### Scheduled backups

Set `BACKUP_ENABLED=true` in `.env`. The backend runs `pg_dump` at 02:00 daily,
gzips the dump, emails it to `BACKUP_EMAIL_RECIPIENTS`, and optionally SFTPs it
to `SFTP_HOST`. Backups older than `BACKUP_RETENTION_DAYS` are auto-deleted.

---

## Monitoring & Logs

```bash
# Live logs
docker compose logs -f

# Per-service
docker compose logs -f backend --tail=100
docker compose logs -f frontend --tail=100

# Database size
docker compose exec postgres psql -U $DB_USERNAME $DB_NAME \
  -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));"

# Active connections
docker compose exec postgres psql -U $DB_USERNAME $DB_NAME \
  -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## Security Checklist

- [ ] All default passwords changed via Profile → Security
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are unique, ≥32 chars
- [ ] `DB_PASSWORD` and `REDIS_PASSWORD` are strong (≥16 chars, mixed)
- [ ] `DB_SYNC=false` in production (migrations only)
- [ ] Firewall: only ports 80/443 exposed externally; 5432/6379 internal only
- [ ] SSL certificate installed and auto-renewing
- [ ] `BACKUP_ENABLED=true` with valid email recipients
- [ ] Review audit logs at `/audit` after first week of use

---

## Troubleshooting

**Backend won't start**
```bash
docker compose logs backend | tail -50
# Common: DB_PASSWORD mismatch or DB not ready
docker compose exec postgres pg_isready -U $DB_USERNAME
```

**Migration fails**
```bash
# Reset and re-run (development only — destructive)
docker compose exec postgres psql -U $DB_USERNAME $DB_NAME \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose exec backend npm run migration:run
docker compose exec backend npm run seed
```

**OCR not working**
Tesseract is installed in the backend Docker image. If receipts aren't being
processed, check `TESSERACT_LANG` and that the `uploads` volume is writable:
```bash
docker compose exec backend ls -la /app/uploads
```

**File uploads failing**
Check `STORAGE_MAX_FILE_SIZE` (default 10 MB) and that the uploads volume mounted:
```bash
docker volume inspect pounds_mfi_uploads_data
```
