# SOUL.md
# PROJECT SOUL MATRIX: MikoPBX
# ─────────────────────────────────────────────────────────────────────────────
# This file is the LIVING MEMORY of this project.
# It MUST be read before any development session begins.
# It MUST be updated after every completed feature or change.
# No exceptions.
# ─────────────────────────────────────────────────────────────────────────────
# Global rules: See MASTER_ENV.md
# ─────────────────────────────────────────────────────────────────────────────

---

## 1. ESSENCE & VALUE PROPOSITION

- **Project Name**: MikoPBX
- **Project Slug**: `mikopbx`
- **Core Purpose**: Self-hosted PBX phone system (FreeBSD + Asterisk) providing SIP trunking, IVR, call routing, voicemail, and call recording for InsiderTechSol internal or client telephony.
- **Target Audience**: IT admins, InsiderTechSol internal ops / client telephony deployments
- **Business Owner**: Insider Tech Sol
- **Primary Domain**: `https://pbx.insider.co.tz`
- **Admin Panel**: `https://pbx.insider.co.tz` (via Nginx Proxy Manager)
- **Host IP**: `107.174.35.100`
- **Dev Port**: `4001`
- **Current Version**: v1.0.0
- **Project Status**: Active

---

## 2. ACTIVE STACK & CONFIGURATION

### Deployment Archetype
- [x] Docker VPS (Nginx Proxy Manager)

### Core Technology
```
PBX Image:   ghcr.io/mikopbx/mikopbx-x86-64:latest (FreeBSD + Asterisk)
Frontend:    MikoPBX built-in web UI (served on container port 80)
Admin Panel: MikoPBX built-in (proxied via NPM)
Database:    SQLite (embedded in MikoPBX image)
Storage:     Docker named volumes (mikopbx_cf, mikopbx_storage)
```

### Network Architecture
```
Internet
  └── Cloudflare DNS
        └── Nginx Proxy Manager
              └── pbx.insider.co.tz → 107.174.35.100:4000 (host port binding)

VoIP (direct host binding — bypasses NPM):
  ├── UDP/TCP 5060  → SIP signaling
  ├── TCP 5061      → SIP/TLS
  └── UDP 10000-10200 → RTP media streams

SSH Admin Console:
  └── 127.0.0.1:2222 → container:222 (localhost only)
```

### Docker Network
- External network: `web-proxy`
- Container name: `mikopbx_app`

### SSL Provider
- [x] Let's Encrypt (via NPM)

---

## 3. ACTIVE MODULES

| Module       | Status    | Notes                                      |
|-------------|-----------|---------------------------------------------|
| SIP Trunking | ✅ Active | Configured via MikoPBX admin → Providers    |
| IVR          | ✅ Active | Built-in MikoPBX module                    |
| Call Routing | ✅ Active | Built-in MikoPBX module                    |
| Voicemail    | ✅ Active | Built-in MikoPBX module                    |
| Call Recording| ✅ Active| Stored in mikopbx_storage volume           |
| Web Admin    | ✅ Active | Proxied via NPM → pbx.insider.co.tz        |

---

## 4. PORT REFERENCE

| Port       | Protocol | Purpose                | Exposed To      |
|-----------|----------|------------------------|-----------------|
| 4000      | TCP      | MikoPBX Web Admin UI   | Host → NPM      |
| 222       | TCP      | MikoPBX SSH Console    | localhost:2222  |
| 5060      | UDP/TCP  | SIP Signaling          | Public          |
| 5061      | TCP      | SIP/TLS                | Public          |
| 10000-10200| UDP     | RTP Media Streams      | Public          |

---

## 7. STATE RECONCILIATION MATRIX — THE LIVING TRUTH

### 7.1 Existing Capabilities (Do Not Re-create or Alter)

| Feature / Component        | Description                                          | Added On   |
|---------------------------|------------------------------------------------------|------------|
| Docker Compose stack       | Production compose with web-proxy network + volumes | 2026-07-25 |
| Nginx Proxy Manager setup  | NPM proxy host docs for pbx.insider.co.tz          | 2026-07-25 |
| SIP/RTP port bindings      | Host-level bindings for VoIP traffic                | 2026-07-25 |
| Automated backup script    | Daily volume backups to /var/backups/{hostname}/    | 2026-07-25 |
| Dev compose override       | Port 8080 direct access without NPM                 | 2026-07-25 |

### 7.2 Known Issues & Technical Debt

| Issue                             | Severity | Workaround Active | Target Fix |
|----------------------------------|----------|-------------------|------------|
| NAT traversal requires EXTERNAL_IP set | M  | Yes — .env + MikoPBX admin setting | v1.0.1 |
| RTP range 201 ports slow on Docker start | L | Accepted — VoIP requirement | — |

### 7.3 Active Credentials & Keys Mapped (Keys only — never values)

```
HOST_IP:              set in .env ✓
EXTERNAL_IP:          set in .env ✓ (must match VPS public IP)
TZ:                   set in .env ✓
HOSTNAME:             set in .env ✓
MIKOPBX_SSH_PORT:     set in .env ✓
```

---

## 8. ARCHITECTURE OVERVIEW

### System Map
```
Internet → Cloudflare → Nginx Proxy Manager (web-proxy network)
  └── pbx.insider.co.tz → mikopbx_app:80 (web admin)

Direct host ports (VoIP — cannot go through NPM):
  ├── :5060 UDP/TCP  → SIP
  ├── :5061 TCP      → SIPS
  └── :10000-10200 UDP → RTP

Volumes:
  ├── mikopbx_cf      → /cf  (config, dialplans, extensions)
  └── mikopbx_storage → /storage (recordings, voicemail, CDR)

Backups:
  └── /var/backups/{hostname}/mikopbx/  (daily cron, 30-day retention)
```

### Key Business Rules
```
1. SIP/RTP traffic NEVER routes through NPM — must be direct host bindings
2. Web admin only reachable via HTTPS through NPM proxy (not direct port 80)
3. EXTERNAL_IP must be set to VPS public IP for correct NAT traversal
4. SSH admin console bound to 127.0.0.1 only — no external access
5. Backups run daily at 02:00 via cron
```

---

## 10. EVOLUTIONARY UPGRADE LOG

```
[2026-07-25] v1.0.0 — Project initialized. Docker Compose stack built with
                       web-proxy network, NPM proxy setup, SIP/RTP port bindings,
                       automated backup script, dev override compose.
[Add new entries below ↓]
```

---

## 11. DEPLOYMENT CHECKLIST

```
[x] docker-compose.yml created with web-proxy network
[x] .env.example with all required variables
[x] SIP/RTP ports bound directly to host
[x] Web admin (port 80) accessible only via NPM (not externally exposed)
[x] Backup script created with 30-day retention
[x] DEPLOYMENT.md with NPM proxy host instructions
[ ] .env filled with real values on VPS
[ ] web-proxy network exists on VPS
[ ] NPM proxy host configured for pbx.insider.co.tz
[ ] EXTERNAL_IP set in MikoPBX admin → Network settings
[ ] Firewall rules applied (5060 UDP/TCP, 5061 TCP, 10000-10200 UDP)
[ ] Admin password changed from default
[ ] SSL certificate issued via NPM / Let's Encrypt
[ ] Backup cron job added: 0 2 * * * /opt/mikopbx/backup/backup.sh
```

---

*SOUL.md last updated: 2026-07-25 by Claude (DevOps agent)*
