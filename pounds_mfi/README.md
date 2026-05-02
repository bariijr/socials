# Pounds Microfinance Ltd — Management System

Production-grade, dockerized microfinance management system for **POUNDS MICROFINANCE LTD**.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, mobile-first) |
| Backend | NestJS 10 + TypeORM |
| Database | PostgreSQL 16 |
| Queue | Redis 7 + BullMQ |
| OCR | Tesseract.js |
| Storage | Local volumes (S3-ready) |
| Auth | JWT + Refresh tokens |
| Notifications | Email (SMTP) + SMS (Africa's Talking / Twilio) + WhatsApp (360dialog) |

---

## Quick Start

### 1. Clone and configure

```bash
git clone <repo>
cd pounds_mfi
cp .env.example .env
# Edit .env with your values
```

### 2. Start services

```bash
docker-compose up -d
```

### 3. Run migrations

```bash
docker exec pounds_mfi_backend npm run migration:run
```

### 4. Seed initial data

```bash
docker exec pounds_mfi_backend npm run seed
```

### 5. Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| API Docs | http://localhost:3001/api/docs (dev only) |

---

## Default Credentials

> **Change immediately after first login!**

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@pounds.mfi | Admin@123456 |
| Admin | admin@pounds.mfi | Admin@123456 |
| Loan Officer | officer@pounds.mfi | Admin@123456 |
| Borrower | borrower@pounds.mfi | Admin@123456 |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   NGINX Proxy Manager            │
│              (SSL termination, routing)          │
└──────────────┬──────────────────┬───────────────┘
               │                  │
    ┌──────────▼──┐       ┌──────▼──────────┐
    │  Frontend   │       │    Backend API   │
    │  Next.js    │       │    NestJS        │
    │  Port 3000  │       │    Port 3001     │
    └─────────────┘       └──────┬──────────┘
                                 │
              ┌──────────────────┼────────────────┐
              │                  │                │
    ┌─────────▼──┐     ┌────────▼──┐    ┌────────▼──┐
    │ PostgreSQL │     │   Redis    │    │  Storage  │
    │ Port 5432  │     │  Port 6379 │    │  Volume   │
    └────────────┘     └────────────┘    └───────────┘
```

---

## NGINX Proxy Manager Configuration

In NPM, create two proxy hosts:

**Frontend (main domain):**
- Domain: `mfi.yourdomain.com`
- Forward: `pounds_mfi:3000`
- Network: `web-proxy`
- Enable SSL + Force HTTPS

**API (subdomain or path):**
- Domain: `api.mfi.yourdomain.com` (or configure Next.js rewrites)
- Forward: `pounds_mfi_backend:3001`
- Network: `web-proxy`

---

## Features

### Authentication & Security
- JWT access tokens (15 min) + refresh tokens (7 days)
- 15-minute inactivity auto-logout
- Session tracking with IP + device
- Rate limiting (100 req/min)
- Brute-force protection (lockout after 5 failed attempts)
- Immutable audit logs on all mutations
- RBAC with role hierarchy

### Loan Lifecycle
```
draft → submitted → approved → disbursed → overdue → closed
                                                    ↑
                                           (auto at due date)
```
- **Strict rule**: Creator ≠ Approver (enforced at DB level)
- Loans locked after approval (no edits)
- Record-level optimistic locking (concurrent edit detection)
- Weekly compounding penalties (5% of balance)
- Partial repayments supported

### Receipt Processing (OCR Pipeline)
1. User uploads receipt (image/PDF) via drag & drop
2. BullMQ queues OCR job
3. Tesseract extracts: receipt number, amount, date, payer
4. User confirms/corrects OCR data
5. Auto-approval flow
6. **Hard blocks**: duplicate file hash, duplicate fingerprint, duplicate receipt number
7. **Soft flags**: similar payments detected

### KYC Module
- Multi-step form (4 steps)
- Public access (no login required for borrowers)
- Document uploads with OCR auto-fill
- Printable PDF generation
- Lead tracking (for site visitors)

### Disbursements
- Manual only — proof upload **required**
- Stores: amount, date, method, bank, transaction ref, uploaded proof
- Verification flow

### Notifications
- 4 channels: Email, SMS, WhatsApp, In-app push (SSE)
- Per-user preferences
- Delivery logs with retry logic (3 attempts, exponential backoff)
- Failover between providers (AT → Twilio, 360dialog → Meta)

### Backups
- Auto-schedule: 2:00 AM daily
- Emailed to multiple admins
- SFTP/rsync upload
- 30-day retention
- Manual trigger via admin UI

---

## Environment Variables

See `.env.example` for full reference. Key variables:

```env
# Required
DB_PASSWORD=                    # PostgreSQL password
JWT_SECRET=                     # Min 32 chars
JWT_REFRESH_SECRET=             # Min 32 chars
REDIS_PASSWORD=                 # Redis auth

# Branding
BRAND_NAME="Pounds Microfinance Ltd"
BRAND_PRIMARY_COLOR=#1e40af

# Notifications
SMTP_HOST=smtp.gmail.com
AT_API_KEY=                     # Africa's Talking
WHATSAPP_API_KEY=               # 360dialog

# Backups
BACKUP_EMAIL_RECIPIENTS=admin@example.com
SFTP_HOST=backup.example.com
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | All system users |
| `sessions` | Active JWT sessions |
| `audit_logs` | Immutable change history |
| `settings` | Key-value configuration |
| `kyc_forms` | KYC applications |
| `kyc_documents` | Uploaded KYC files |
| `loan_packages` | Loan product definitions |
| `loans` | Loan applications |
| `repayments` | Payment records |
| `penalties` | Overdue charges |
| `receipts` | Payment receipts |
| `receipt_files` | Receipt uploads |
| `disbursements` | Disbursement records |
| `notifications` | Notification queue |
| `notification_logs` | Delivery logs |
| `backups` | Backup records |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Current user |
| GET | `/api/v1/dashboard/kpis` | Dashboard KPIs |
| GET | `/api/v1/loans` | List loans |
| POST | `/api/v1/loans` | Create loan |
| PATCH | `/api/v1/loans/:id/approve` | Approve loan |
| PATCH | `/api/v1/loans/:id/disburse` | Disburse |
| POST | `/api/v1/receipts/upload` | Upload receipt |
| GET | `/api/v1/kyc` | List KYC forms |
| POST | `/api/v1/kyc/public` | Public KYC entry |
| GET | `/api/v1/notifications` | Notifications |
| GET | `/api/v1/settings/branding` | Brand config |
| GET | `/api/v1/health` | Health check |

---

## Development

```bash
# Backend only
cd backend
npm install
npm run start:dev

# Frontend only
cd frontend
npm install
npm run dev

# Run migrations
npm run migration:run

# Generate migration
npm run migration:generate -- -n MigrationName
```

---

## Roles & Permissions

| Action | Super Admin | Admin | Loan Officer | User |
|--------|-------------|-------|--------------|------|
| View dashboard | ✓ | ✓ | ✓ | — |
| Create loan | ✓ | ✓ | ✓ | — |
| Approve loan | ✓ | ✓ | — | — |
| Disburse loan | ✓ | ✓ | — | — |
| View own loans | ✓ | ✓ | ✓ | ✓ |
| Manage users | ✓ | ✓ | — | — |
| System settings | ✓ | — | — | — |
| Run backup | ✓ | — | — | — |

---

## Security Notes

1. Change all default passwords immediately
2. Set strong `JWT_SECRET` (32+ chars)
3. Enable SSL in NGINX Proxy Manager
4. Set `NODE_ENV=production`
5. Configure firewall — only expose ports 80/443 externally
6. Audit logs are **immutable** — cannot be deleted via API
7. All file uploads are virus-scanned via content validation

---

## Support

Pounds Microfinance Ltd
Email: support@yourdomain.com
Phone: +254700000000
