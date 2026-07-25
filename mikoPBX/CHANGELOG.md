# CHANGELOG — MikoPBX

All notable changes to this project are documented here.
Format: `[YYYY-MM-DD] vX.Y.Z — Description`

---

## [2026-07-25] v1.0.4 — Fix /dev/console via entrypoint wrapper

### Changed
- Added custom `entrypoint` to docker-compose.yml:
  `mknod -m 622 /dev/console c 5 1 2>/dev/null; exec /sbin/docker-entrypoint`
- Removed `devices: /dev/console` (host doesn't provide it — mknod inside is the fix)
- Updated DEPLOYMENT.md, SOUL.md — all stale port/hostname references cleaned

### Why
MikoPBX FreeBSD entrypoint (line 40) tries to open `/dev/console` before starting
nginx and Asterisk. Without it, the container loops silently and nothing boots.
With `privileged: true`, mknod can create the device node at runtime.

---

## [2026-07-25] v1.0.3 — privileged mode for FreeBSD compatibility

### Changed
- Added `privileged: true` — required for FreeBSD services to init inside Linux Docker

---

## [2026-07-25] v1.0.2 — Expose web UI on host port 4000

### Changed
- Added `4000:80` port mapping — NPM forwards pbx.insider.co.tz → `107.174.35.100:4000`
- Removed broken healthcheck (MikoPBX has no /health endpoint)

### NPM Settings
- Forward Hostname: `107.174.35.100`
- Forward Port: `4000`

---

## [2026-07-25] v1.0.1 — Port + Domain Config

### Changed
- Dev port: `8080` → `4001`
- Domain: set to `pbx.insider.co.tz`
- HOST_IP / EXTERNAL_IP: set to `107.174.35.100`

---

## [2026-07-25] v1.0.0 — Initial Docker Stack

### Added
- `docker-compose.yml` — `ghcr.io/mikopbx/mikopbx-x86-64:latest`, web-proxy network,
  named volumes (mikopbx_cf, mikopbx_storage), SIP/RTP host bindings, SSH localhost only
- `docker-compose.dev.yml` — dev override, port 4001
- `.env.example` — all variables pre-filled for 107.174.35.100 / pbx.insider.co.tz
- `backup/backup.sh` — daily cron, 30-day retention
- `DEPLOYMENT.md`, `SOUL.md`, `README.md`, `.gitignore`

---

*Add new entries above this line after each change.*
