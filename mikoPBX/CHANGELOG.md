# CHANGELOG — MikoPBX

All notable changes to this project are documented here.
Format: `[YYYY-MM-DD] vX.Y.Z — Description`

---

## [2026-07-25] v1.0.0 — Initial Docker Stack

### Added
- `docker-compose.yml` — Production stack using `ghcr.io/mikopbx/mikopbx-x86-64:latest`
  - External `web-proxy` network for Nginx Proxy Manager integration
  - Named volumes: `mikopbx_cf` (config) and `mikopbx_storage` (media/recordings)
  - SIP port bindings: 5060 UDP/TCP, 5061 TCP
  - RTP media range: 10000–10200 UDP (direct host binding)
  - SSH admin console: 127.0.0.1:2222 (localhost only)
  - JSON log driver with rotation (10MB × 3 files)
- `docker-compose.dev.yml` — Dev override exposing web UI on port 8080
- `.env.example` — All environment variables documented
- `backup/backup.sh` — Daily automated volume backup with 30-day retention
- `DEPLOYMENT.md` — Step-by-step VPS deploy + NPM proxy host configuration guide
- `SOUL.md` — Project state matrix initialized

---

*Add new entries above this line after each change.*
