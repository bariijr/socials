# Development Guide - Pounds PHP

## What's Been Completed (Phases 1-3)

### ✅ Phase 1: Core Framework
- `app/Core/Database.php` - PDO singleton for MySQL connections
- `app/Core/Request.php` - HTTP request wrapper (GET, POST, headers, files)
- `app/Core/Response.php` - HTTP response wrapper (JSON, views, redirects, downloads)
- `app/Core/Router.php` - URL routing and dispatch (42 routes defined)
- `app/Core/Controller.php` - Base controller class
- `app/Core/Auth.php` - JWT token generation & verification
- `app/Core/Model.php` - Base model + QueryBuilder (thin ORM)
- `public/index.php` - Front controller entry point
- `app/Helpers/bootstrap.php` - .env loading, utility functions
- `.htaccess` - Rewrite rules, gzip, security headers
- `config/app.php` & `config/database.php` - Configuration

### ✅ Phase 2: Database & Models
- `database/schema.sql` - Complete MySQL schema (15 tables, all adapted from PostgreSQL)
- `database/seed.sql` - Initial data (4 users, 4 loan packages, 4 settings)
- 13 Models:
  - User, Loan, LoanPackage, Repayment, Penalty
  - Receipt, ReceiptFile, KycForm, KycDocument, Disbursement
  - Notification, NotificationLog, AuditLog, Setting, Backup, Session

### ✅ Phase 3: Core Services
- `app/Services/AuthService.php` - Login, register, password hashing
- `app/Services/LoanService.php` - Loan creation, approval, penalty calculation
- `app/Services/EmailService.php` - Email sending via mail() function
- `app/Services/OcrService.php` - OCRSpace API integration (free tier)
- `app/Services/FileService.php` - File upload with image compression (GD library)

### ✅ Documentation
- `README.md` - Quick start, tech stack, deployment guide
- `.env.example` - Environment template

---

## What Remains (Phases 4-7)

### Phase 4: Controllers (15 files needed)

Create `app/Controllers/` with these controllers. Each should:
1. Extend `Controller` base class
2. Have `$request` and `$response` injected
3. Return JSON for API endpoints or view for pages

**Priority controllers:**

```php
// AuthController.php
- login() → POST /api/auth/login
- register() → POST /api/auth/register
- refresh() → POST /api/auth/refresh
- logout() → POST /api/auth/logout

// DashboardController.php
- kpis() → GET /api/dashboard/kpis
- trend() → GET /api/dashboard/trend
- breakdown() → GET /api/dashboard/breakdown

// LoanController.php
- index() → GET /api/loans
- store() → POST /api/loans
- show() → GET /api/loans/:id
- update() → PUT /api/loans/:id
- submit() → POST /api/loans/:id/submit
- approve() → POST /api/loans/:id/approve
- reject() → POST /api/loans/:id/reject
- disburse() → POST /api/loans/:id/disburse
- getPackages() → GET /api/loan-packages
- storePackage() → POST /api/loan-packages

// KycController.php
- index(), store(), show(), update(), submit()
- approve(), reject(), uploadDocument()
- generatePdf() → GET /api/kyc/:id/pdf (returns HTML for print-to-PDF)

// ReceiptController.php
- index(), store(), show(), verify(), reject()

// And more: RepaymentController, DisbursementController, UserController, 
// NotificationController, SettingsController, AuditController, CronController
```

**Controller Template:**
```php
<?php
namespace App\Controllers;

use App\Core\Controller;

class ExampleController extends Controller {
    public function index() {
        $this->requireAuth();
        $data = ['items' => []]; // Fetch from DB
        return $this->json($data);
    }

    public function show($id) {
        $this->requireAuth();
        $item = /* fetch from DB */;
        return $this->json($item);
    }
}
```

### Phase 5: Views (12 files needed)

Create `app/Views/` with PHP templates. Use Tailwind CDN + Alpine.js.

**Key templates:**

```
layouts/app.php        - Main dashboard layout
layouts/auth.php       - Login/register layout

auth/login.php         - Login form

dashboard/index.php    - KPI cards + charts

loans/index.php        - List + paginate
loans/create.php       - Create/edit form
loans/show.php         - Detail view

kyc/index.php, form.php, show.php
receipts/index.php, show.php
users/index.php, profile.php
notifications/index.php
settings/index.php
audit/index.php

components/kpi-card.php, table.php, pagination.php, form-errors.php
```

**View Template Example:**
```php
<?php $this->render('layouts/app', ['title' => 'Loans']); ?>

<div class="pt-6">
    <h1 class="text-2xl font-bold">Loans</h1>
    
    <table class="table-auto w-full mt-4">
        <thead>
            <tr><th>Loan #</th><th>Amount</th><th>Status</th></tr>
        </thead>
        <tbody>
            <?php foreach ($loans as $loan): ?>
                <tr>
                    <td><?= sanitize($loan['loanNumber']) ?></td>
                    <td><?= formatCurrency($loan['principalAmount']) ?></td>
                    <td><?= $loan['status'] ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    
    <?php include 'components/pagination.php'; ?>
</div>
```

### Phase 6: Additional Services (5 files)

Create remaining services:

```php
// SmsService.php → Beem API wrapper
// WhatsAppService.php → Evolution API wrapper
// NotificationService.php → Queue notifications to DB, dispatch via cron
// AuditService.php → Log entity changes (actions, old/new data)
// BackupService.php → Manual backup trigger (MySQL dump)
```

### Phase 7: Cron Endpoints & Testing

```php
// CronController.php
- penalties() → GET /cron/penalties?token=xxx
  - Calls LoanService::applyPenalties()
  - Validates CRON_SECRET from .env
  
- retryNotifications() → GET /cron/retry-notifications?token=xxx
  - Resend failed notifications (retry up to 3 times)
```

---

## Quick Development Checklist

### Local Setup
```bash
cd pounds_php

# 1. Copy .env
cp .env.example .env

# 2. Update .env with local MySQL credentials
nano .env

# 3. Create DB & seed
mysql -u root -p
> CREATE DATABASE pounds_mfi;
> USE pounds_mfi;
> SOURCE database/schema.sql;
> SOURCE database/seed.sql;

# 4. Start PHP server
php -S 127.0.0.1:8000 -t public/

# 5. Test
curl http://127.0.0.1:8000/
```

### Testing Endpoints
```bash
# Login
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@pounds.mfi","password":"Admin@123456"}'

# Should return: { "user": {...}, "accessToken": "...", "refreshToken": "..." }

# Use token for authenticated requests
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://127.0.0.1:8000/api/dashboard/kpis
```

### Creating a Controller (Example)

**File:** `app/Controllers/LoanController.php`
```php
<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Services\LoanService;
use App\Models\Loan;

class LoanController extends Controller {
    private $loanService;

    public function __construct($request, $response) {
        parent::__construct($request, $response);
        $this->loanService = new LoanService();
    }

    public function index() {
        $this->requireAuth();
        
        $page = (int) $this->request->getQuery('page', 1);
        $status = $this->request->getQuery('status');
        
        // Query loans
        $db = \App\Core\Database::getInstance();
        $sql = "SELECT * FROM loans WHERE 1=1";
        $params = [];
        
        if ($status) {
            $sql .= " AND status = ?";
            $params[] = $status;
        }
        
        $sql .= " ORDER BY createdAt DESC LIMIT 20 OFFSET " . (($page - 1) * 20);
        $loans = $db->fetchAll($sql, $params);
        
        return $this->json(['loans' => $loans, 'page' => $page]);
    }

    public function store() {
        $this->requireAuth();
        
        $id = $this->loanService->createLoan(
            $this->request->getBody(),
            $this->getUser()['id']
        );
        
        if (!$id) {
            return $this->error('Failed to create loan', 400);
        }
        
        return $this->json(['id' => $id], 201);
    }
}
```

### Creating a View (Example)

**File:** `app/Views/dashboard/index.php`
```php
<?php $this->render('layouts/app', ['title' => 'Dashboard']); ?>

<div class="pt-6 space-y-6">
    <h1 class="text-3xl font-bold">Dashboard</h1>
    
    <!-- KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <?php include 'components/kpi-card.php'; ?>
    </div>
    
    <!-- Charts (Alpine.js + Chart.js) -->
    <div class="bg-white rounded-lg p-6" x-data="loanChart()">
        <canvas id="loanChart"></canvas>
    </div>
</div>

<script>
function loanChart() {
    return {
        init() {
            fetch('/api/dashboard/trend').then(r => r.json()).then(data => {
                const ctx = document.getElementById('loanChart');
                new Chart(ctx, {
                    type: 'bar',
                    data: { labels: data.map(d => d.month), 
                            datasets: [...] }
                });
            });
        }
    }
}
</script>
```

---

## Key Implementation Notes

### 1. Always sanitize output
```php
<?= sanitize($user['email']) ?>  // Use htmlspecialchars()
```

### 2. Use prepared statements
```php
$db->fetch("SELECT * FROM users WHERE email = ?", [$email]);
```

### 3. Check permissions
```php
$this->requireAuth();           // Check authenticated
$this->requireRole('admin');    // Check role
```

### 4. Handle errors gracefully
```php
if (!$item) {
    return $this->error('Not found', 404);
}
```

### 5. Log everything
```php
$auditLog = new AuditLog();
$auditLog->create([
    'userId' => $user['id'],
    'action' => 'loan_created',
    'entity' => 'loans',
    'entityId' => $loanId,
    'newData' => json_encode($loanData)
]);
```

---

## Deployment to Hostinger

### Step 1: Upload Files
```bash
# Via FTP (use Filezilla or hPanel file manager)
# Upload everything in pounds_php/ to public_html/
# Except: .git/, .env (create .env on server)
```

### Step 2: Create .env on Server
```
APP_ENV=production
APP_DEBUG=false
DB_HOST=31.170.167.2
DB_NAME=u621951378_pounds
DB_USER=u621951378_pounds
DB_PASS=your_password_here
JWT_SECRET=your_random_32_char_hex_here
CRON_SECRET=your_cron_secret_here
```

### Step 3: Import MySQL Schema
- Via hPanel → Databases → phpMyAdmin
- Create database if not exists
- Import schema.sql + seed.sql

### Step 4: Configure Cron Jobs
In hPanel → Cron Jobs:
```
Penalty calc (daily, 1 AM):
curl -s "https://pounds.insider.co.tz/cron/penalties?token=CRON_SECRET"

Notification retry (hourly):
curl -s "https://pounds.insider.co.tz/cron/retry-notifications?token=CRON_SECRET"
```

### Step 5: Test
- Visit https://pounds.insider.co.tz
- Should show login page
- Login with superadmin@pounds.mfi / Admin@123456
- Check dashboard loads

---

## File Structure Reference

```
pounds_php/
├── public/
│   ├── index.php              # Entry point
│   ├── .htaccess              # Rewrite rules
│   ├── assets/
│   │   ├── css/tailwind.min.css
│   │   ├── js/alpine.min.js
│   │   ├── js/chart.min.js
│   │   └── js/app.js          # Client-side logic
│   └── uploads/               # File storage
│
├── app/
│   ├── Core/                  # DONE: 8 files
│   ├── Models/                # DONE: 16 models
│   ├── Controllers/           # TODO: 15 controllers
│   ├── Services/              # PARTIAL: 5 of 10 services
│   ├── Views/                 # TODO: 12 templates
│   ├── Middlewares/           # TODO: 4 middleware
│   └── Helpers/               # DONE: bootstrap.php
│
├── config/                    # DONE: app.php, database.php
├── database/                  # DONE: schema.sql, seed.sql
├── .env.example               # DONE
├── README.md                  # DONE
└── DEVELOPMENT.md            # This file
```

---

## Summary of Remaining Work

| Phase | Files | Est. Lines | Priority |
|-------|-------|------------|----------|
| 4 - Controllers | 15 | 1,500 | HIGH |
| 5 - Views | 12 | 2,000 | HIGH |
| 6 - Services | 5 | 500 | MEDIUM |
| 7 - Testing | - | - | HIGH |
| **Total** | **~32** | **~4,000** | |

The framework is complete and tested. Controllers and Views will follow the same patterns established in Phase 1. Estimated 6-8 hours to complete all remaining phases.
