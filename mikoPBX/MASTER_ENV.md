# MASTER_ENV.md
# Insider Tech Sol — Universal Build Environment Guide
# Version: 2.0.0 | Owner: Insider Tech Sol
# Last Updated: 2026-06-12
# Purpose: Single source of truth for ALL project environments, constraints, hosting, stack defaults, and infrastructure rules.
# ─────────────────────────────────────────────────────────────────────────────
# HOW TO USE THIS FILE
# Feed this file to your AI agent or coding assistant at the START of every
# session. It eliminates re-explanation of infrastructure, hosting, security,
# and stack preferences. Never repeat what is in here — reference it.
# ─────────────────────────────────────────────────────────────────────────────

---

## 1. CORE BUILD PHILOSOPHY

> **Every project is an upgrade, never a rebuild.**

### Non-Negotiable Rules
- Existing functionality must continue working unless explicitly deprecated.
- New features integrate INTO existing architecture — never replace it.
- Backward compatibility is always preferred.
- Every change must be documented in SOUL.md and CHANGELOG.md.
- No hardcoding of passwords, API keys, tokens, or certificates — ever.
- Secrets live in .env files only. Never committed to version control.
- Every project is: Mobile-First, API-First, Multi-tenant Ready, White-label Ready, Modular, Scalable, Cloud Deployable, Offline-Tolerant where possible.

---

## 2. HOSTING ENVIRONMENTS

### ENVIRONMENT A — Hostinger Shared Hosting (hPanel)
- **Runtime**: PHP (Laravel or vanilla PHP)
- **Database**: MySQL / MariaDB
- **SSL**: Cloudflare (proxy ON) or Hostinger SSL
- **Cron Jobs**: hPanel cron manager
- **Queue Workers**: Supported where hPanel allows
- **File Routing**: .htaccess must route all requests to /public

**.htaccess Standard:**
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/public/
    RewriteRule ^(.*)$ public/$1 [L]
</IfModule>
```

**Constraints:**
- No Docker on shared hosting
- No root access
- Limited persistent background processes
- Storage: local disk only (no S3 direct from shared)
- Use Hostinger Secure Mail Relay for SMTP fallback

---

### ENVIRONMENT B — VPS / Docker Compose (Primary for Node, Python, multi-service apps)
- **OS**: Ubuntu LTS (latest stable)
- **Container Engine**: Docker + Docker Compose
- **Reverse Proxy**: Nginx Proxy Manager (NPM) — GUI-based, same network
- **SSL**: Cloudflare (preferred) or Let's Encrypt via NPM
- **Network**: All services share one external Docker network (`proxy-net`)
- **Ports**: Each service runs on a unique internal port; NPM handles external routing
- **Environments**: Dev → Staging → Production (always separated)

**Required Project Files for VPS Deployments:**
```
/docker/
/docker-compose.yml
/docker-compose.dev.yml
/docker-compose.staging.yml
/.env.example
/nginx/
/backup/
```

**Standard Docker Compose Base:**
```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: ${PROJECT_SLUG}_app
    restart: unless-stopped
    networks:
      - proxy-net
    environment:
      - APP_ENV=${APP_ENV}
      - TENANT_ID=${TENANT_ID}
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - ./storage:/var/www/html/storage
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  proxy-net:
    external: true
```

**Operational Requirements (All VPS Projects):**
- Automated daily backups (DB + volumes)
- SSL enabled on all public endpoints
- Health check endpoints (/health or /ping)
- Log rotation configured
- Environment separation enforced

---

## 3. DEFAULT TECH STACK

> Use the best tool for the project. The list below is the preferred default — deviate with justification in SOUL.md.

### Backend
| Priority | Technology      | Use Case                          |
|----------|-----------------|-----------------------------------|
| Primary  | Laravel (PHP)   | Hostinger, traditional apps       |
| Alt 1    | NestJS (Node)   | Event-driven, real-time, APIs     |
| Alt 2    | Next.js (Node)  | Full-stack React apps             |
| Alt 3    | FastAPI (Python)| ML/AI workloads, data services    |
| Alt 4    | Django (Python) | Complex data models, admin-heavy  |

### Frontend
| Priority | Technology    | Use Case                        |
|----------|---------------|---------------------------------|
| Primary  | Next.js/React | Web apps, SSR, SEO-critical     |
| Alt 1    | Vue/Nuxt      | Lightweight SPAs                |
| Alt 2    | Vanilla JS    | Simple embeds, widgets          |
| Admin    | Filament      | Laravel admin panels            |
| Admin    | React Admin   | React-based admin dashboards    |

### Mobile
| Priority | Technology    |
|----------|---------------|
| Primary  | Flutter       |
| Alt      | React Native  |

### Database
| Priority | Technology  | Use Case                     |
|----------|-------------|------------------------------|
| Primary  | PostgreSQL   | All VPS/Docker projects      |
| Secondary| MySQL/MariaDB| Hostinger/shared hosting     |
| Cache    | Redis        | Sessions, queues, caching    |
| Search   | MeiliSearch  | Self-hosted full-text search |
| Alt Search| Algolia    | Managed search, if budget OK |

### Storage
| Option        | When to Use                         |
|---------------|-------------------------------------|
| Local disk    | Dev, Hostinger, small projects      |
| Cloudflare R2 | Production, cost-effective S3-compatible |
| MinIO         | Self-hosted S3 on VPS               |
| AWS S3        | Enterprise/client requirement       |

### Queues & Background Jobs
- Redis Queue (Laravel Horizon / Bull / BullMQ)
- Cron jobs via hPanel (Hostinger) or container cron (VPS)

---

## 4. SECURITY STANDARDS (MANDATORY — ALL PROJECTS)

### Input & Output
- Validate ALL user input server-side (never trust client)
- Sanitize all output rendered to HTML (XSS prevention)
- Parameterize ALL database queries (SQL injection prevention)
- Strip or encode dangerous characters in file names

### Transport & Auth
- HTTPS enforced on all public endpoints (Cloudflare or NPM SSL)
- CSRF protection on all state-changing form endpoints
- Rate limiting on: login, OTP, password reset, API endpoints
- MFA available on all auth flows
- JWT tokens: short expiry + refresh token rotation
- Sessions: secure, httpOnly, sameSite cookies

### Infrastructure
- Secrets: .env only, never in code or version control
- Add .env to .gitignore — always
- Audit logs on: login, logout, updates, deletes, permission changes, API calls
- Docker containers run as non-root users
- CORS: explicit allowed origins only — no wildcard in production
- DDoS mitigation: Cloudflare proxy ON for all public-facing domains
- Fail2ban or similar on VPS SSH

### Never Hardcode
```
❌ Passwords     ❌ API Keys      ❌ Tokens
❌ Certificates  ❌ DB Credentials ❌ Webhook secrets
```

### Code Quality Security
- SOLID principles enforced
- Repository pattern + Service layer (no logic in controllers)
- Dependency injection (no direct class instantiation of providers)
- Feature tests + unit tests required before production deploy

---

## 5. API STANDARDS (ALL PROJECTS)

### Versioning
```
/api/v1/resource
/api/v2/resource   ← only on breaking changes
```

### Standard JSON Response Wrapper
```json
{
  "status": "success",
  "timestamp": "2026-06-12T12:32:00Z",
  "meta": {
    "tenant_id": "tenant_slug_001",
    "pagination": {
      "current_page": 1,
      "per_page": 15,
      "total_records": 142,
      "has_more": true
    }
  },
  "data": {},
  "errors": []
}
```

**Error Response:**
```json
{
  "status": "error",
  "timestamp": "2026-06-12T12:32:05Z",
  "meta": { "tenant_id": "tenant_slug_001" },
  "data": null,
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "field": "phone_number",
      "message": "The phone number format provided is invalid for region TZ."
    }
  ]
}
```

### Required on All APIs
- Authentication (Bearer JWT or API Key)
- Documentation (OpenAPI / Swagger auto-generated)
- Pagination (cursor or offset)
- Filtering + Sorting
- Webhook support where applicable
- GZIP / Brotli compression on responses
- Rate limiting headers returned

---

## 6. DATABASE STANDARDS

All tables must include:

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id   VARCHAR(64) NOT NULL,      -- Always present for multi-tenant
created_at  TIMESTAMP DEFAULT NOW(),
updated_at  TIMESTAMP DEFAULT NOW(),
deleted_at  TIMESTAMP NULL             -- Soft deletes
```

### Multi-Tenant Database Models
| Model           | Best For                        | Implementation                              |
|-----------------|---------------------------------|---------------------------------------------|
| Shared DB       | Hostinger, lightweight apps     | tenant_id column on ALL tables + WHERE filter |
| Separate Schema | Medium isolation need           | PostgreSQL schemas per tenant               |
| Separate DB     | High security, Docker projects  | Dynamic DB connection routing per request   |

- Always use UUIDs (not auto-increment integers) for primary keys
- Indexes on: tenant_id, created_at, frequently filtered columns
- Foreign keys enforced at DB level
- Migration files required — no manual schema changes in production
- Seeders for default data (roles, settings, admin user)

---

## 7. UI / FRONTEND STANDARDS

### Mobile-First Breakpoints
```css
/* Mobile: default (no breakpoint) */
/* Tablet: 768px */
/* Desktop: 1024px */
/* Wide: 1280px+ */
```

### Design Token System (Default Dark Mode — Luxury/Corporate)
```css
:root {
  --bg-primary:    #0f1115;   /* Deep slate black */
  --bg-secondary:  #161920;   /* Slate grey surfaces */
  --bg-tertiary:   #202530;   /* Elevated frames */

  --text-primary:  #f3f4f6;   /* Off-white text */
  --text-secondary:#9ca3af;   /* Muted grey */

  --accent-gold:   #d4af37;   /* Primary highlights */
  --accent-emerald:#10b981;   /* Success / Active */
  --accent-crimson:#ef4444;   /* Error / Warning */

  --radius-btn:    8px;
  --radius-card:   12px;
  --font-display:  'Inter', system-ui, sans-serif;
}
```

### Requirements
- Dark Mode + Light Mode (toggle)
- Accessibility: WCAG AA minimum
- Fast loading: lazy loading, image optimization, code splitting
- Reusable component library per project
- RTL support considered for languages that require it

---

## 8. INTERNATIONALISATION (i18n)

- All user-facing strings stored in JSON language files
- No hardcoded display text in components or templates
- Language files location: `/lang/{locale}/` or `/i18n/{locale}.json`
- Default locale: `en`

### Supported Locales (expand as needed)
```
/lang/
  en.json       English
  sw.json       Swahili
  zh.json       Chinese (Simplified)
  fr.json       French
  ar.json       Arabic (RTL)
  [add as needed]
```

### JSON Structure Standard
```json
{
  "auth": {
    "login": "Login",
    "logout": "Logout",
    "otp_sent": "OTP sent to {destination}"
  },
  "errors": {
    "required": "{field} is required",
    "invalid_phone": "Invalid phone number for region {region}"
  }
}
```

---

## 9. ENVIRONMENT VARIABLES MASTER TEMPLATE

> Copy to .env.example in every project. Fill per environment.

```ini
# ── APP ──────────────────────────────────────────────
APP_NAME=
APP_ENV=production          # development | staging | production
APP_KEY=
APP_DEBUG=false
APP_URL=https://yourdomain.com
PROJECT_SLUG=               # Used for container naming

# ── TENANT ───────────────────────────────────────────
TENANT_ID=
TENANT_MODE=shared          # shared | schema | isolated

# ── DATABASE ─────────────────────────────────────────
DB_CONNECTION=pgsql         # pgsql | mysql
DB_HOST=
DB_PORT=5432
DB_DATABASE=
DB_USERNAME=
DB_PASSWORD=

# ── CACHE / QUEUE ────────────────────────────────────
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=
QUEUE_CONNECTION=redis

# ── STORAGE ──────────────────────────────────────────
STORAGE_DRIVER=local        # local | s3 | r2 | minio
S3_KEY=
S3_SECRET=
S3_BUCKET=
S3_REGION=
S3_ENDPOINT=                # For R2/MinIO

# ── AUTH ─────────────────────────────────────────────
JWT_SECRET=
SESSION_LIFETIME=120
MFA_ENABLED=true

# Social OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# ── SMS ──────────────────────────────────────────────
SMS_PRIMARY_PROVIDER=beem   # beem | twilio | africas_talking | nexmo | custom
SMS_FALLBACK_PROVIDER=twilio

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SENDER_NUMBER=

BEEM_API_KEY=
BEEM_SECRET_KEY=
BEEM_SENDER_ID=INFO

AFRICAS_TALKING_USERNAME=
AFRICAS_TALKING_API_KEY=

CUSTOM_SMS_ENDPOINT=
CUSTOM_SMS_AUTH_TOKEN=

# ── WHATSAPP ─────────────────────────────────────────
WA_PRIMARY_PROVIDER=meta    # meta | twilio | 360dialog | gupshup | custom
WA_PHONE_NUMBER_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=
WA_BUSINESS_ACCOUNT_ID=

CUSTOM_WA_ENDPOINT=
CUSTOM_WA_AUTH_BEARER=

# ── EMAIL ────────────────────────────────────────────
EMAIL_DRIVER=resend         # resend | mailgun | sendgrid | ses | smtp | brevo
EMAIL_FROM_NAME=
EMAIL_FROM_ADDRESS=

RESEND_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_API_KEY=
SENDGRID_API_KEY=
SES_KEY=
SES_SECRET=
SES_REGION=
BREVO_API_KEY=

SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_ENCRYPTION=tls

# ── CHATBOT / AI ─────────────────────────────────────
BOT_ROUTING_TIER=ai_llm_proxy     # ai_llm_proxy | static_intent_tree
BOT_CONTEXT_WINDOW_LIMIT=10
BOT_LLM_PROVIDER=openai           # openai | anthropic | gemini | deepseek | ollama
BOT_LLM_API_KEY=
BOT_LLM_MODEL=gpt-4o-mini
BOT_SYSTEM_PROMPT=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
OLLAMA_ENDPOINT=http://localhost:11434

# ── VOICE ────────────────────────────────────────────
VOICE_PROVIDER=elevenlabs         # twilio | elevenlabs | asterisk
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# ── BILLING ──────────────────────────────────────────
BILLING_GATEWAY=stripe            # stripe | paypal | flutterwave | pesapal | selcom | custom
STRIPE_KEY=
STRIPE_SECRET=
STRIPE_WEBHOOK_SECRET=
FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
PESAPAL_CONSUMER_KEY=
PESAPAL_CONSUMER_SECRET=
SELCOM_API_KEY=
SELCOM_API_SECRET=

# ── SEARCH ───────────────────────────────────────────
SEARCH_ENGINE=meilisearch         # meilisearch | algolia | elasticsearch
MEILISEARCH_HOST=
MEILISEARCH_KEY=
ALGOLIA_APP_ID=
ALGOLIA_SECRET=

# ── MONITORING ───────────────────────────────────────
SENTRY_DSN=
LOG_CHANNEL=stack
LOG_LEVEL=error
```

---

## 10. REQUIRED DOCUMENTS — EVERY PROJECT

| File            | Purpose                                    |
|-----------------|--------------------------------------------|
| README.md       | Project overview, setup, quick start       |
| SOUL.md         | Living memory — architecture + state       |
| CHANGELOG.md    | All changes, versions, dates               |
| API.md          | API endpoints reference                    |
| SECURITY.md     | Security policies, disclosure process      |
| DEPLOYMENT.md   | Deploy steps for each environment          |
| ARCHITECTURE.md | System design, module map, data flow       |
| ROADMAP.md      | Future features, milestones                |
| TESTING.md      | Test strategy, coverage requirements       |

---

## 11. DEVELOPMENT WORKFLOW — EVERY FEATURE

```
Step 1  → Read SOUL.md          (understand current state)
Step 2  → Read CHANGELOG.md     (understand what changed)
Step 3  → Analyze request       (scope the feature)
Step 4  → Impact assessment     (what breaks? what depends?)
Step 5  → Implement             (targeted — do not touch unrelated code)
Step 6  → Test                  (unit + feature tests)
Step 7  → Update documentation  (API.md, README if needed)
Step 8  → Deploy                (per DEPLOYMENT.md)
Step 9  → Update SOUL.md        (log the new state)
Step 10 → Update CHANGELOG.md   (log the change)
```

---

## 12. AI AGENT ROLES (Assign at session start)

| Agent           | Responsibility                                                     |
|-----------------|--------------------------------------------------------------------|
| @Architect      | System design, schemas, module contracts, configuration interfaces |
| @Backend        | APIs, business logic, service layers                               |
| @Frontend       | UI components, mobile-first layouts, design token compliance       |
| @Database       | Schema design, migrations, query optimization                      |
| @Security       | Input validation, auth flows, audit, encryption                    |
| @DevOps         | Docker, Nginx, CI/CD, backups, monitoring                          |
| @QA             | Test coverage, edge cases, regression                              |
| @Docs           | README, API.md, SOUL.md, CHANGELOG.md updates                     |
| @AI             | LLM integrations, chatbot flows, prompt engineering                |
| @Refactor       | Code quality, SOLID compliance, DRY enforcement                    |

**Session Initialization Prompt (paste at start of every build session):**
```
Initialize build context using MASTER_ENV.md and this project's SOUL.md.
Review active environment, stack, and module configuration.
Do not rewrite existing functionality.
Do not introduce new packages without flagging for approval.
Every output is an upgrade, not a rewrite.
Update SOUL.md and CHANGELOG.md upon task completion.
```

---

## 13. CODE QUALITY STANDARDS

- **SOLID** principles enforced on all classes and services
- **DRY** — no duplicate logic; extract to shared services or modules
- **KISS** — simplest working solution first
- **Repository Pattern** — data access isolated from business logic
- **Service Layer** — business logic isolated from controllers
- **Events & Listeners** — decouple side effects from primary flows
- **Dependency Injection** — never instantiate concrete providers directly
- **Tests** — unit tests for services, feature tests for API endpoints
- **Code Reviews** — no direct merges to main/production branch

---

*End of MASTER_ENV.md*
*This file is the single source of truth. Reference it. Do not duplicate it.*
