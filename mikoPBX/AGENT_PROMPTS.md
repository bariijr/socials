# AGENT_PROMPTS.md
# Insider Tech Sol — AI Agent Prompt Library
# Version: 2.0.0 | Owner: Insider Tech Sol
# Last Updated: 2026-06-12
# ─────────────────────────────────────────────────────────────────────────────
# Ready-to-paste prompts for AI agents and coding assistants.
# Use these at the START of every session to eliminate context re-explanation.
# ─────────────────────────────────────────────────────────────────────────────

---

## HOW TO USE THIS FILE

1. Copy the relevant prompt below
2. Paste at the START of your AI coding session (before any task)
3. Attach MASTER_ENV.md and SOUL.md to the session context
4. Then state your specific task
5. The agent will not re-ask about stack, hosting, or environment

---

## PROMPT 001 — SESSION INITIALIZATION (Universal)

> Paste this at the very start of EVERY build session.

```
CONTEXT INITIALIZATION — INSIDER TECH SOL BUILD FRAMEWORK

Read and internalize the following files before proceeding:
1. MASTER_ENV.md   — Global environment, stack, security, API, and UI standards
2. SOUL.md         — This project's current state, active modules, architecture, and upgrade log

Operational Rules:
- Every output is an UPGRADE, never a rewrite
- Do NOT modify existing functionality unless explicitly instructed
- Do NOT introduce new packages without flagging for approval first
- Do NOT hardcode secrets, credentials, or environment-specific values
- All secrets go in .env variables only
- Mobile-first on all UI work
- Follow the standard API response wrapper defined in MASTER_ENV.md
- Follow the abstract interface / dependency injection pattern for all providers
- After completing any task: update SOUL.md State Reconciliation Matrix and CHANGELOG.md

Stack context is in MASTER_ENV.md. Do not ask about hosting, SSL, stack, or environment — it is already defined.
```

---

## PROMPT 002 — FEATURE SPRINT (New Feature / Module Integration)

```
FEATURE SPRINT — [FEATURE NAME]

Context: [This project's SOUL.md and MASTER_ENV.md are active in session]

Task:
Implement [describe the feature clearly].

Reference:
- Follow the structural pattern for [module name] in MODULE_REGISTRY.md
- Provider abstraction via interface — do not instantiate concrete classes directly

Constraints:
- Modify ONLY: [list specific files/classes that should change]
- Do NOT alter: [list files that must not be touched]
- Do NOT rebuild any existing functionality listed in SOUL.md Section 7.1

Deliverables:
1. Implementation code
2. Migration file (if schema changes)
3. .env.example additions (if new ENV keys needed)
4. Updated SOUL.md Section 7.1 entry
5. CHANGELOG.md entry

This is an upgrade to version [X.Y.Z+1].
```

---

## PROMPT 003 — MODULE INTEGRATION (Plug-in a new module)

```
MODULE INTEGRATION — [MODULE NAME from MODULE_REGISTRY.md]

Context: [SOUL.md and MASTER_ENV.md active]

Task:
Integrate the [MODULE NAME] module into this project.

Provider selection (from .env):
  [State which provider to activate — e.g., SMS_PRIMARY_PROVIDER=beem]

Constraints:
- Use the abstract interface pattern — controller must call interface, not concrete class
- All credentials go in .env only
- Do not touch existing auth/session/core logic
- Mobile-first on any UI components

Steps to follow:
1. Scaffold the service interface
2. Implement the selected provider adapter
3. Register in service container / DI
4. Add ENV keys to .env.example
5. Create migration if schema is needed
6. Add API endpoint if required
7. Update SOUL.md modules table
8. Update CHANGELOG.md
```

---

## PROMPT 004 — SECURITY AUDIT

```
SECURITY AUDIT — [FEATURE / COMPONENT NAME]

Context: [SOUL.md and MASTER_ENV.md active]

Task:
Perform a security audit on the following component: [component name or paste code]

Check for:
✓ Input validation (all user input sanitized)
✓ SQL injection vulnerabilities
✓ XSS vulnerabilities
✓ CSRF protection on state-changing endpoints
✓ Authentication bypass risks
✓ Authorization / permission checks on all routes
✓ Rate limiting in place
✓ Sensitive data exposed in API responses or logs
✓ Hardcoded credentials or secrets
✓ Insecure direct object references (IDOR)
✓ File upload security (type validation, virus scan)
✓ JWT / session security
✓ CORS policy correctness
✓ Tenant isolation — no cross-tenant data leakage

Return:
- List of findings with severity (Critical / High / Medium / Low)
- Recommended fix for each finding
- Code patch where applicable
```

---

## PROMPT 005 — DATABASE SCHEMA DESIGN

```
DATABASE SCHEMA DESIGN — [FEATURE NAME]

Context: [SOUL.md and MASTER_ENV.md active]

Task:
Design the database schema for [feature description].

Requirements:
- Primary DB: [PostgreSQL / MySQL — per SOUL.md]
- All tables must include: id (UUID), tenant_id, created_at, updated_at, deleted_at (soft delete)
- Use UUID primary keys only (no auto-increment integers)
- Define indexes on: tenant_id, frequently filtered columns, foreign keys
- Enforce foreign key constraints at DB level
- Multi-tenancy model: [Shared DB / Schema / Isolated — per SOUL.md]

Deliverables:
1. CREATE TABLE SQL statements
2. Index definitions
3. Migration file (Laravel/Django/Prisma format as applicable)
4. Seeder for default data if applicable
5. ER diagram (ASCII or described)
```

---

## PROMPT 006 — API ENDPOINT BUILD

```
API ENDPOINT BUILD — [ENDPOINT NAME]

Context: [SOUL.md and MASTER_ENV.md active]

Task:
Build the following API endpoint(s):
  [List endpoints: method, path, description]
  Example: POST /api/v1/auth/otp/send — Send OTP to phone number

Requirements:
- Follow versioned path structure: /api/v{n}/
- Use the standard JSON response wrapper from MASTER_ENV.md Section 5
- Authentication required: [Yes / No / Optional]
- Rate limiting: [Yes — X requests per Y minutes]
- Input validation: [list expected fields and rules]
- Permissions: [which roles can access]

Deliverables:
1. Route definition
2. Controller / handler
3. Service layer logic (no business logic in controller)
4. Request validation rules
5. API.md documentation entry
6. Feature test
```

---

## PROMPT 007 — MOBILE-FIRST UI COMPONENT

```
UI COMPONENT BUILD — [COMPONENT NAME]

Context: [SOUL.md and MASTER_ENV.md active]

Task:
Build the following UI component: [describe the component]

Requirements:
- Mobile-first (320px minimum width baseline)
- Use design tokens from MASTER_ENV.md Section 7 (CSS variables)
- Dark mode compliant (--bg-primary, --text-primary, --accent-*)
- Responsive at: 320px, 768px, 1024px, 1280px+
- Accessible: ARIA labels, keyboard navigation, WCAG AA contrast
- No hardcoded colors — use CSS variables only
- Framework: [React/Next.js | Vue | Vanilla — per SOUL.md]
- i18n: all display strings pulled from lang/{locale}.json — no hardcoded text

Deliverables:
1. Component code
2. Props / interface definition
3. Mobile + desktop responsive behavior described
4. Dark mode tokens applied
5. i18n key additions for lang/en.json
```

---

## PROMPT 008 — DEPLOYMENT CHECKLIST EXECUTION

```
DEPLOYMENT REVIEW — [PROJECT NAME] v[VERSION]

Context: [SOUL.md and MASTER_ENV.md active]

Task:
Prepare and validate the deployment package for version [X.Y.Z].

Verify:
[ ] SOUL.md is current and reflects all changes in this release
[ ] CHANGELOG.md updated with version entry and all changes
[ ] .env.example includes all new environment variables
[ ] All migrations tested on staging — no destructive changes to existing data
[ ] Feature tests passing — minimum coverage threshold met
[ ] No hardcoded secrets in codebase (grep for common patterns)
[ ] SSL active on all endpoints
[ ] Health check endpoint responding (/health or /ping)
[ ] Docker Compose / .htaccess validated for target environment
[ ] Backup taken from staging / production before deploy
[ ] Rollback procedure documented

Deployment target: [Hostinger Shared | Docker VPS]
Environment: [Staging | Production]
```

---

## PROMPT 009 — CHATBOT / AI AGENT CONFIGURATION

```
CHATBOT CONFIGURATION — [BOT NAME]

Context: [SOUL.md and MASTER_ENV.md active]

Task:
Configure and build the [bot type] chatbot for this project.

Bot Type: [Website Widget | WhatsApp | Telegram | Voice | AI Agent]
Routing Tier: [AI LLM Proxy | Static Intent Tree | Hybrid]
LLM Provider: [openai | anthropic | gemini | deepseek | ollama]
LLM Model: [gpt-4o-mini | claude-sonnet-4-5 | gemini-2.0-flash]
Channel: [website | whatsapp | telegram | voice]

System Prompt:
[Paste or describe the bot's persona and rules here]

RAG / Knowledge Base: [Yes — source: | No]
Human Handoff: [Yes — trigger: | No]
Languages: [en | sw | zh | ...]
Context Window: [10 messages]

Deliverables:
1. Webhook receiver implementation
2. Context assembly logic
3. LLM routing configuration
4. Multi-channel response formatter
5. Conversation history schema
6. ENV additions
7. SOUL.md chatbot config section update
```

---

## PROMPT 010 — SOUL.md UPDATE (After any completed work)

```
SOUL.md UPDATE

Task:
Update this project's SOUL.md to reflect the changes just completed.

Changes made:
[Describe what was built/modified]

Update the following sections:
1. Section 2 — Active Stack (if stack changed)
2. Section 3 — Active Modules (check/add modules used)
3. Section 7.1 — Existing Capabilities (add new features as rows)
4. Section 7.2 — Known Issues (if any discovered)
5. Section 7.3 — Active Credentials (mark new keys as set ✓)
6. Section 10 — Evolutionary Upgrade Log (append new dated entry)
7. Section 11 — Deployment Checklist (mark completed items)

Version bump: [X.Y.Z] → [X.Y.Z+1]
Date: [Today's date]
```

---

## AGENT ROLE ASSIGNMENTS

> State which agent role is active at the start of specialized sessions:

```
@Architect  — System design, schemas, module contracts
@Backend    — APIs, business logic, service layers
@Frontend   — UI, mobile-first, design tokens
@Database   — Schema, migrations, query optimization
@Security   — Auth, validation, audit, encryption
@DevOps     — Docker, Nginx, CI/CD, backups
@QA         — Tests, edge cases, regression
@Docs       — README, API.md, SOUL.md, CHANGELOG.md
@AI         — LLM integrations, chatbot, prompt engineering
@Refactor   — Code quality, SOLID, DRY
```

**Usage:**
```
Acting as @Security: Review the OTP flow in [file] for rate limiting and brute force risks.
Acting as @Frontend: Build the login screen component, mobile-first, dark mode, i18n-ready.
Acting as @DevOps: Write the docker-compose.yml for this project using the VPS pattern in MASTER_ENV.md.
```

---

*End of AGENT_PROMPTS.md*
*Copy. Paste. Build. Never re-explain.*
