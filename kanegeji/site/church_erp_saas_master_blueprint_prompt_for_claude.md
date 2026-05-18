# MASTER CLAUDE CODE PROMPT — PARISH ERP + ACCOUNTING + AI ECOSYSTEM

You are a senior full-stack architect, DevOps engineer, database architect, cybersecurity engineer and UI/UX expert.

Your task is to design and build a production-grade:

# Multi-Parish Catholic Church ERP + Accounting + AI Ecosystem

The system must be:
- Mobile-first
- Ultra-fast
- Modular
- SaaS-capable later
- Secure
- Offline-capable
- Deployable on Hostinger shared hPanel hosting initially
- Upgradeable later to VPS/Docker/Kubernetes

The target users are Catholic parishes in Tanzania.

The first deployment will be a single parish, but the architecture MUST support multi-parish SaaS expansion later.

The system should support:
- Accounting
- Member management
- Sacraments
- Fundraising
- Online giving
- Reporting
- AI assistant
- Catholic content
- Notifications
- Inventory
- Payroll
- Event ticketing
- Hall bookings
- Ebook shop
- QR verification
- Document management

====================================================================
# CORE TECH STACK
====================================================================

## Backend
- Custom PHP 8.3
- MVC architecture
- PDO prepared statements only
- No Laravel
- No WordPress
- No heavy frameworks
- Modular architecture
- Service-based structure
- REST-like internal architecture
- CSRF protection
- Session-based authentication
- Token-ready architecture for future mobile apps

## Frontend
- TailwindCSS
- Alpine.js
- HTMX where needed
- Mobile-first responsive design
- PWA-ready architecture
- Offline-capable later
- Dark/light mode toggle
- Swahili + English bilingual support

## Database
- MySQL / MariaDB
- Proper indexing
- Transaction-safe queries
- Soft delete where needed
- Audit logging
- Multi-tenant ready structure

## Reporting
Use:
- mPDF
- PhpSpreadsheet
- PHPWord

Reports must export to:
- Web view
- PDF
- Excel
- Word

## Notifications
Support:
- WhatsApp
- SMS
- Email

Priority flow:
1. WhatsApp
2. SMS fallback
3. Email fallback

## Payment System
Phase 1:
- Manual payment confirmation
- Payment instructions

Future phase:
- M-Pesa API
- Airtel Money API
- Mix by Yas API
- Selcom API

Build payment abstraction layer from beginning.

## AI
Use:
- Internal knowledgebase search first
- OpenAI API fallback
- Human WhatsApp handoff if AI fails

====================================================================
# MULTI-PARISH SAAS ARCHITECTURE
====================================================================

Design database and architecture to support:

- Single parish initially
- Multi-parish SaaS later
- Parish isolation
- Separate reports per parish
- Shared SaaS admin later
- Subscription-ready architecture later

Every core table should include:
- parish_id

Examples:
- members
- transactions
- inventory
- campaigns
- notifications
- documents

====================================================================
# USER ACCESS LEVELS
====================================================================

Design RBAC system.

## Roles

### 1. Super Admin
- Full system access
- Multi-parish management later
- Security settings
- System settings
- AI knowledge control
- Backup management

### 2. Chairman
- Full parish oversight
- Financial approvals
- Reports
- User oversight
- Fundraising oversight

### 3. Accountant
- Accounting access
- Reports
- Reconciliation
- Payroll
- Receipts
- Budgeting

### 4. Priest / Padri
- View reports
- Announcements
- Sacraments
- Member records
- Pastoral content

### 5. Secretary / Clerk
- Data entry only
- Limited editing

### 6. Member
- Self portal access
- View contributions
- Download receipts
- Event tickets
- Hall bookings

====================================================================
# AUTHENTICATION + SECURITY
====================================================================

Implement:

- Secure login
- Password hashing
- Session regeneration
- CSRF protection
- XSS prevention
- Rate limiting
- Upload validation
- SQL injection prevention
- 2FA-ready architecture
- Device/session logs
- Login history
- IP logging
- Browser logging
- Activity tracking

====================================================================
# AUDIT LOGGING
====================================================================

Track EVERYTHING:

- login
- logout
- failed login
- transaction creation
- transaction edits
- transaction deletion
- report exports
- approvals
- payment actions
- AI interactions
- uploads
- inventory edits
- payroll changes

Create:
- audit_logs table
- login_logs table

====================================================================
# LANGUAGE SYSTEM
====================================================================

Use JSON-based translation system.

Examples:
/lang/sw.json
/lang/en.json

Static content should use JSON where possible.

Examples:
- labels
- UI text
- prayer text
- static Catholic content
- liturgical text

System must support:
- live language switching
- persistent user preference

====================================================================
# PWA + OFFLINE CAPABILITY
====================================================================

System must be PWA-ready.

Future offline support:
- IndexedDB
- Sync queue
- Offline transaction storage
- Auto-sync when internet returns

Offline-capable modules:
- member registration
- transaction entry
- fundraising records

====================================================================
# MODULE BREAKDOWN
====================================================================

####################################################################
# MODULE 1 — PUBLIC WEBSITE
####################################################################

Features:
- Homepage
- About parish
- Priest message
- Mass schedules
- Announcements
- Events
- Fundraising campaigns
- AI chatbot
- Online giving
- Livestream embeds
- Catholic resources
- Prayer section
- Daily readings
- Catholic calendar
- Contact forms
- Media gallery
- Downloads

####################################################################
# MODULE 2 — MEMBER MANAGEMENT
####################################################################

Fields:
- Full name
- Gender
- DOB
- Phone
- Email
- Address
- Jumuiya
- Baptism certificate
- Confirmation status
- Marriage status
- Occupation
- Family linkage
- Profile photo
- QR member ID

Features:
- Search
- Export
- Member portal
- Member login
- Receipt history
- Notification preferences

####################################################################
# MODULE 3 — SACRAMENTS
####################################################################

Track:
- Baptism
- Confirmation
- Communion
- Marriage

Features:
- Certificate uploads
- Certificate generation
- QR verification
- PDF exports

####################################################################
# MODULE 4 — JUMUIYA MANAGEMENT
####################################################################

Support:
- 23+ jumuiya
- growth over time

Features:
- leader assignment
- member list
- contribution totals
- fundraising participation
- performance analytics
- ranking dashboard
- comparative reports

####################################################################
# MODULE 5 — ACCOUNTING SYSTEM
####################################################################

Use proper accounting standards.

Implement simplified accrual accounting.

### Income Types
- Zaka
- Sadaka
- Shukrani
- Ufadhili
- Misaada
- Harambee
- Online giving
- Anonymous giving
- Jumuiya contributions
- Special campaigns

### Expense Types
- Utilities
- Salaries
- Maintenance
- Construction
- Media
- Charity
- Liturgical expenses
- Transport
- Office expenses

####################################################################
# ACCOUNTING DATABASE STRUCTURE
####################################################################

Core tables:
- accounts
- journal_entries
- journal_entry_items
- transactions
- categories
- payment_methods
- bank_accounts
- reconciliations
- budgets
- approvals
- receipts

Implement:
- double-entry-ready structure
- category filtering
- date filtering
- annual reports
- quarterly reports
- custom reports

####################################################################
# MODULE 6 — PAYMENTS + ONLINE GIVING
####################################################################

Phase 1:
- payment instructions
- manual verification
- uploaded proof

Future:
- API integrations

Features:
- donation campaigns
- anonymous donations
- recurring donations later
- receipts
- QR verification

####################################################################
# MODULE 7 — FUNDRAISING ENGINE
####################################################################

Features:
- campaigns
- targets
- progress bars
- community fundraising
- anonymous donors
- pledge tracking
- campaign analytics

####################################################################
# MODULE 8 — INVENTORY + ASSETS
####################################################################

Track:
- equipment
- church property
- liturgical items
- vehicles
- electronics
- furniture

Features:
- depreciation
- maintenance logs
- QR asset labels
- assignment tracking

####################################################################
# MODULE 9 — PAYROLL
####################################################################

Features:
- employee records
- salary structures
- payroll runs
- deductions
- allowances
- payroll PDF exports

####################################################################
# MODULE 10 — DOCUMENT MANAGEMENT
####################################################################

Features:
- official parish letters
- meeting minutes
- uploaded PDFs
- categorized documents
- searchable documents
- permission control
- version history

####################################################################
# MODULE 11 — EVENT TICKETING
####################################################################

Features:
- event creation
- ticket generation
- QR ticket verification
- PDF ticket export
- online reservations

####################################################################
# MODULE 12 — HALL BOOKINGS
####################################################################

Features:
- hall calendar
- booking requests
- payment status
- booking approvals
- invoices

####################################################################
# MODULE 13 — CHURCH SHOP + EBOOK SHOP
####################################################################

Physical shop:
- books
- rosaries
- church items

Ebook shop:
- PDFs
- downloadable books
- access control

Features:
- orders
- payments
- downloads
- inventory tracking

####################################################################
# MODULE 14 — AI KNOWLEDGE ASSISTANT
####################################################################

Public AI:
- church info
- mass schedules
- Catholic guidance
- fundraising info

Internal AI:
- analytics queries
- reporting assistance
- accounting summaries
- document lookup

Knowledge sources:
- uploaded PDFs
- announcements
- Catholic books
- catechism
- parish procedures

Features:
- AI fallback logic
- human handoff
- WhatsApp escalation
- admin knowledge uploads

####################################################################
# MODULE 15 — CATHOLIC CONTENT ENGINE
####################################################################

Include:
- Catechism
- Catholic calendar
- Daily readings
- Saints of the day
- Prayers
- Devotions
- Novenas

Support:
- English
- Swahili

====================================================================
# DATABASE SCHEMA REQUIREMENTS
====================================================================

Generate complete SQL schema.

Core tables must include:

## System
- parishes
- users
- roles
- permissions
- user_roles
- audit_logs
- login_logs
- settings

## Members
- members
- families
- communities
- sacraments
- certificates

## Accounting
- accounts
- account_types
- journal_entries
- journal_items
- transactions
- transaction_categories
- budgets
- reconciliations
- approvals
- receipts

## Fundraising
- campaigns
- campaign_contributions
- pledges

## Inventory
- assets
- asset_categories
- maintenance_logs

## Notifications
- notification_preferences
- notification_logs
- whatsapp_logs
- sms_logs
- email_logs

## Documents
- documents
- document_categories
- document_versions

## AI
- ai_knowledge
- ai_conversations
- ai_feedback

## Events
- events
- event_tickets
- hall_bookings

## Ecommerce
- products
- product_categories
- orders
- order_items
- ebook_downloads

====================================================================
# REPORTING ENGINE
====================================================================

Generate advanced reporting engine.

Support:
- daily
- weekly
- monthly
- quarterly
- annual
- custom ranges

Support filters:
- categories
- jumuiya
- member
- fundraising campaign
- payment method
- parish

Generate:
- PDF
- Excel
- Word
- Web dashboards

====================================================================
# QR VERIFICATION SYSTEM
====================================================================

Every:
- receipt
- certificate
- ticket
- official document

Should support QR verification.

Verification URLs example:
https://domain.com/verify/XXXXXX

====================================================================
# BACKUP SYSTEM
====================================================================

Implement automatic backups.

Daily:
- database backup
- uploads backup

Destinations:
- email
- Google Drive
- Dropbox

====================================================================
# HOSTINGER SHARED HOSTING DEPLOYMENT
====================================================================

Generate deployment instructions for:
- Hostinger hPanel
- PHP setup
- MySQL setup
- cron jobs
- SSL
- LiteSpeed cache
- file permissions
- backup scheduling
- .env setup
- production optimization

Structure:
/public_html
/storage
/uploads
/app
/modules
/config
/lang

====================================================================
# PERFORMANCE OPTIMIZATION
====================================================================

The system must support:
- 200 active users comfortably
- mobile-first performance
- low bandwidth environments
- fast page loads

Use:
- DB indexes
- lazy loading
- optimized queries
- image optimization
- LiteSpeed caching
- pagination
- queue-ready architecture later

====================================================================
# MOBILE-FIRST UI REQUIREMENTS
====================================================================

Design for phones FIRST.

Requirements:
- bottom navigation
- large touch targets
- responsive tables
- quick transaction forms
- dark/light mode
- fast loading
- clean dashboard
- accessible design

====================================================================
# FUTURE MOBILE APP SUPPORT
====================================================================

Prepare architecture for:
- Android app
- iOS app

Use API-ready structure.

====================================================================
# DEVELOPMENT ROADMAP
====================================================================

####################################################################
# PHASE 1 — CORE SYSTEM
####################################################################

Build:
- auth
- RBAC
- dashboard
- accounting core
- reports
- member management
- jumuiya system
- audit logs
- receipts

####################################################################
# PHASE 2 — ADVANCED FINANCE
####################################################################

Build:
- fundraising
- approvals
- payroll
- reconciliation
- inventory
- QR verification

####################################################################
# PHASE 3 — COMMUNICATIONS
####################################################################

Build:
- WhatsApp
- SMS
- Email engine
- notification preferences
- campaigns

####################################################################
# PHASE 4 — AI + KNOWLEDGE
####################################################################

Build:
- AI assistant
- Catholic knowledgebase
- document AI search
- human handoff

####################################################################
# PHASE 5 — ECOMMERCE + BOOKINGS
####################################################################

Build:
- shop
- ebook system
- event ticketing
- hall bookings

####################################################################
# PHASE 6 — OFFLINE + MOBILE APPS
####################################################################

Build:
- offline sync
- PWA enhancements
- mobile APIs
- Android/iOS apps

====================================================================
# CODING STANDARDS
====================================================================

Requirements:
- clean architecture
- SOLID principles
- reusable services
- modular code
- environment variables in .env
- proper logging
- production-ready code
- no hardcoded secrets

====================================================================
# FINAL OUTPUT REQUIREMENTS
====================================================================

Generate:

1. Full system architecture
2. Database schema
3. Folder structure
4. Security architecture
5. Module breakdown
6. API architecture
7. Hostinger deployment guide
8. Offline strategy
9. Notification architecture
10. AI architecture
11. SaaS expansion strategy
12. Performance optimization plan
13. Backup strategy
14. Development roadmap
15. Suggested UI layouts
16. Suggested dashboard analytics
17. ERD explanation
18. Example SQL tables
19. Example .env structure
20. Suggested cron jobs
21. Recommended libraries
22. Mobile app future strategy
23. Payment gateway abstraction structure
24. QR verification flow
25. Report generation flow

The final system must be scalable, secure, mobile-first, ultra-fast, bilingual, accounting-grade, and production-ready.

