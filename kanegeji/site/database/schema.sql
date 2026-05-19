-- ============================================================
-- KANEGEJI PARISH ERP — PHASE 1 COMPLETE DATABASE SCHEMA
-- MySQL 8+ / MariaDB 10.6+
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+03:00';
SET foreign_key_checks = 0;

-- ============================================================
-- SYSTEM TABLES
-- ============================================================

CREATE TABLE parishes (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    diocese     VARCHAR(200),
    address     TEXT,
    phone       VARCHAR(30),
    email       VARCHAR(150),
    website     VARCHAR(200),
    logo_path   VARCHAR(300),
    timezone    VARCHAR(60) NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    currency    VARCHAR(10) NOT NULL DEFAULT 'TZS',
    locale      VARCHAR(10) NOT NULL DEFAULT 'sw',
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO parishes (name, diocese, address, phone, email, timezone)
VALUES ('Parokia ya Kanegeji', 'Jimbo la Mwanza', 'Kanegeji, Mwanza, Tanzania', '+255700000000', 'info@kanegeji.go.tz', 'Africa/Dar_es_Salaam');

CREATE TABLE roles (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    name        VARCHAR(60) NOT NULL,
    slug        VARCHAR(60) NOT NULL,
    description TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_role_slug (parish_id, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (parish_id, name, slug, description) VALUES
(1, 'Super Admin',  'super_admin',  'Full system access'),
(1, 'Chairman',     'chairman',     'Full parish oversight and approvals'),
(1, 'Accountant',   'accountant',   'Accounting, payroll, reconciliation'),
(1, 'Priest',       'priest',       'View reports, sacraments, pastoral'),
(1, 'Secretary',    'secretary',    'Data entry, limited editing'),
(1, 'Member',       'member',       'Self-service portal only');

CREATE TABLE permissions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    module      VARCHAR(60) NOT NULL,
    description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (name, slug, module) VALUES
-- Members
('View Members',          'members.view',    'Members'),
('Create Members',        'members.create',  'Members'),
('Edit Members',          'members.edit',    'Members'),
('Delete Members',        'members.delete',  'Members'),
-- Accounting
('View Transactions',     'accounting.view',         'Accounting'),
('Create Transactions',   'accounting.create',       'Accounting'),
('Edit Transactions',     'accounting.edit',         'Accounting'),
('Delete Transactions',   'accounting.delete',       'Accounting'),
('Approve Transactions',  'accounting.approve',      'Accounting'),
('Export Reports',        'reports.export',          'Reports'),
-- Jumuiya
('View Jumuiya',          'jumuiya.view',    'Jumuiya'),
('Manage Jumuiya',        'jumuiya.manage',  'Jumuiya'),
-- Users
('View Users',            'users.view',      'Users'),
('Create Users',          'users.create',    'Users'),
('Edit Users',            'users.edit',      'Users'),
('Delete Users',          'users.delete',    'Users'),
-- System
('View Audit Logs',       'audit.view',      'Audit'),
('Manage Settings',       'settings.manage', 'Settings'),
-- Reports
('View Reports',          'reports.view',    'Reports');

CREATE TABLE role_permissions (
    role_id         INT UNSIGNED NOT NULL,
    permission_id   INT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id           INT UNSIGNED NOT NULL DEFAULT 1,
    member_id           INT UNSIGNED DEFAULT NULL,
    name                VARCHAR(150) NOT NULL,
    email               VARCHAR(150) NOT NULL,
    phone               VARCHAR(30),
    password_hash       VARCHAR(255) NOT NULL,
    role_id             INT UNSIGNED NOT NULL,
    avatar_path         VARCHAR(300),
    lang                VARCHAR(10) NOT NULL DEFAULT 'sw',
    active              TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at       DATETIME DEFAULT NULL,
    password_reset_token VARCHAR(100) DEFAULT NULL,
    password_reset_expires DATETIME DEFAULT NULL,
    two_fa_secret       VARCHAR(100) DEFAULT NULL,
    two_fa_enabled      TINYINT(1) NOT NULL DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME DEFAULT NULL,
    UNIQUE KEY uq_user_email (email),
    KEY idx_users_parish (parish_id),
    KEY idx_users_role (role_id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default super admin (password: Admin@123 — CHANGE IN PRODUCTION)
INSERT INTO users (parish_id, name, email, phone, password_hash, role_id, lang)
VALUES (1, 'System Administrator', 'admin@kanegeji.go.tz', '+255700000000',
        '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1, 'sw');

CREATE TABLE login_logs (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED DEFAULT NULL,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    email       VARCHAR(150),
    ip_address  VARCHAR(45) NOT NULL,
    user_agent  TEXT,
    status      ENUM('success','failed','locked') NOT NULL,
    reason      VARCHAR(200) DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_login_user (user_id),
    KEY idx_login_ip (ip_address),
    KEY idx_login_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    user_id         INT UNSIGNED DEFAULT NULL,
    user_name       VARCHAR(150),
    action          VARCHAR(100) NOT NULL,
    module          VARCHAR(60) NOT NULL,
    entity_type     VARCHAR(60) DEFAULT NULL,
    entity_id       INT UNSIGNED DEFAULT NULL,
    old_values      JSON DEFAULT NULL,
    new_values      JSON DEFAULT NULL,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_parish (parish_id),
    KEY idx_audit_user (user_id),
    KEY idx_audit_module (module),
    KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    `key`       VARCHAR(100) NOT NULL,
    `value`     TEXT,
    type        ENUM('string','integer','boolean','json') NOT NULL DEFAULT 'string',
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_setting (parish_id, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEMBER MANAGEMENT
-- ============================================================

CREATE TABLE communities (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    name        VARCHAR(150) NOT NULL,
    zone        VARCHAR(100),
    leader_name VARCHAR(150),
    leader_phone VARCHAR(30),
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_community_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO communities (parish_id, name, zone) VALUES
(1, 'Mtakatifu Petro',    'Kaskazini'),
(1, 'Mtakatifu Paulo',    'Kaskazini'),
(1, 'Bikira Maria',       'Kusini'),
(1, 'Mtakatifu Yosefu',   'Kusini'),
(1, 'Mtakatifu Yohane',   'Mashariki'),
(1, 'Roho Mtakatifu',     'Mashariki'),
(1, 'Mtakatifu Fransisko','Magharibi'),
(1, 'Mtakatifu Dominiko', 'Magharibi'),
(1, 'Mtakatifu Augustino','Kati'),
(1, 'Mtakatifu Benedikto','Kati');

CREATE TABLE families (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    family_name VARCHAR(150) NOT NULL,
    community_id INT UNSIGNED DEFAULT NULL,
    address     TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_family_parish (parish_id),
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE members (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id           INT UNSIGNED NOT NULL DEFAULT 1,
    member_number       VARCHAR(30) UNIQUE,
    family_id           INT UNSIGNED DEFAULT NULL,
    community_id        INT UNSIGNED DEFAULT NULL,
    first_name          VARCHAR(80) NOT NULL,
    middle_name         VARCHAR(80),
    last_name           VARCHAR(80) NOT NULL,
    gender              ENUM('male','female','other') NOT NULL,
    date_of_birth       DATE,
    phone               VARCHAR(30),
    email               VARCHAR(150),
    occupation          VARCHAR(100),
    address             TEXT,
    photo_path          VARCHAR(300),
    qr_code             VARCHAR(60) UNIQUE,
    baptised            TINYINT(1) NOT NULL DEFAULT 0,
    confirmed           TINYINT(1) NOT NULL DEFAULT 0,
    marriage_status     ENUM('single','married','widowed','divorced','religious') DEFAULT 'single',
    status              ENUM('active','inactive','deceased','transferred') NOT NULL DEFAULT 'active',
    notes               TEXT,
    registered_by       INT UNSIGNED DEFAULT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME DEFAULT NULL,
    KEY idx_member_parish (parish_id),
    KEY idx_member_community (community_id),
    KEY idx_member_family (family_id),
    KEY idx_member_status (status),
    FULLTEXT KEY ft_member_name (first_name, middle_name, last_name),
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE SET NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sacraments (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    member_id       INT UNSIGNED NOT NULL,
    type            ENUM('baptism','confirmation','first_communion','marriage','holy_orders','anointing') NOT NULL,
    date_received   DATE,
    officiant       VARCHAR(150),
    witnesses       TEXT,
    certificate_no  VARCHAR(100),
    certificate_path VARCHAR(300),
    notes           TEXT,
    recorded_by     INT UNSIGNED DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sacrament_member (member_id),
    KEY idx_sacrament_parish (parish_id),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ACCOUNTING
-- ============================================================

CREATE TABLE account_types (
    id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(60) NOT NULL,
    slug    VARCHAR(30) NOT NULL UNIQUE,
    normal_balance ENUM('debit','credit') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO account_types (name, slug, normal_balance) VALUES
('Asset',     'asset',     'debit'),
('Liability', 'liability', 'credit'),
('Equity',    'equity',    'credit'),
('Income',    'income',    'credit'),
('Expense',   'expense',   'debit');

CREATE TABLE chart_of_accounts (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    account_type_id INT UNSIGNED NOT NULL,
    code            VARCHAR(20) NOT NULL,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    parent_id       INT UNSIGNED DEFAULT NULL,
    active          TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_coa_parish (parish_id),
    UNIQUE KEY uq_coa_code (parish_id, code),
    FOREIGN KEY (account_type_id) REFERENCES account_types(id),
    FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO chart_of_accounts (parish_id, account_type_id, code, name) VALUES
-- Assets
(1, 1, '1000', 'Cash in Hand'),
(1, 1, '1010', 'Bank Account - CRDB'),
(1, 1, '1020', 'Bank Account - NMB'),
(1, 1, '1030', 'Mobile Money'),
(1, 1, '1100', 'Accounts Receivable'),
(1, 1, '1500', 'Inventory'),
(1, 1, '1600', 'Property and Equipment'),
-- Liabilities
(1, 2, '2000', 'Accounts Payable'),
(1, 2, '2100', 'Loans Payable'),
-- Equity
(1, 3, '3000', 'Parish Fund'),
-- Income
(1, 4, '4000', 'Zaka'),
(1, 4, '4010', 'Sadaka'),
(1, 4, '4020', 'Shukrani'),
(1, 4, '4030', 'Ufadhili'),
(1, 4, '4040', 'Misaada'),
(1, 4, '4050', 'Harambee'),
(1, 4, '4060', 'Michango ya Jumuiya'),
(1, 4, '4070', 'Online Giving'),
(1, 4, '4080', 'Campaigns'),
(1, 4, '4090', 'Hall Bookings Income'),
(1, 4, '4100', 'Shop Income'),
-- Expenses
(1, 5, '5000', 'Umeme'),
(1, 5, '5010', 'Maji'),
(1, 5, '5020', 'Mishahara'),
(1, 5, '5030', 'Matengenezo'),
(1, 5, '5040', 'Ujenzi'),
(1, 5, '5050', 'Usafiri'),
(1, 5, '5060', 'Ofisi'),
(1, 5, '5070', 'Hisani'),
(1, 5, '5080', 'Muziki na Media'),
(1, 5, '5090', 'Gharama za Liturujia');

CREATE TABLE payment_methods (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    name        VARCHAR(80) NOT NULL,
    type        ENUM('cash','bank','mobile_money','online') NOT NULL DEFAULT 'cash',
    account_id  INT UNSIGNED DEFAULT NULL,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO payment_methods (parish_id, name, type) VALUES
(1, 'Fedha Taslimu', 'cash'),
(1, 'CRDB Bank', 'bank'),
(1, 'NMB Bank', 'bank'),
(1, 'M-Pesa', 'mobile_money'),
(1, 'Airtel Money', 'mobile_money'),
(1, 'Tigo Pesa', 'mobile_money');

CREATE TABLE transaction_categories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    name        VARCHAR(100) NOT NULL,
    type        ENUM('income','expense') NOT NULL,
    account_id  INT UNSIGNED DEFAULT NULL,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    KEY idx_tc_parish (parish_id),
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO transaction_categories (parish_id, name, type, account_id) VALUES
(1, 'Zaka',                'income',  11),
(1, 'Sadaka',              'income',  12),
(1, 'Shukrani',            'income',  13),
(1, 'Ufadhili',            'income',  14),
(1, 'Misaada',             'income',  15),
(1, 'Harambee',            'income',  16),
(1, 'Michango ya Jumuiya', 'income',  17),
(1, 'Online Giving',       'income',  18),
(1, 'Umeme',               'expense', 21),
(1, 'Maji',                'expense', 22),
(1, 'Mishahara',           'expense', 23),
(1, 'Matengenezo',         'expense', 24),
(1, 'Usafiri',             'expense', 25),
(1, 'Ofisi',               'expense', 26),
(1, 'Hisani',              'expense', 27);

CREATE TABLE transactions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id           INT UNSIGNED NOT NULL DEFAULT 1,
    reference_no        VARCHAR(40) NOT NULL UNIQUE,
    type                ENUM('income','expense','transfer') NOT NULL,
    category_id         INT UNSIGNED DEFAULT NULL,
    account_id          INT UNSIGNED DEFAULT NULL,
    payment_method_id   INT UNSIGNED DEFAULT NULL,
    member_id           INT UNSIGNED DEFAULT NULL,
    community_id        INT UNSIGNED DEFAULT NULL,
    amount              DECIMAL(15,2) NOT NULL,
    currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
    description         TEXT,
    transaction_date    DATE NOT NULL,
    receipt_no          VARCHAR(60),
    proof_path          VARCHAR(300),
    status              ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    approved_by         INT UNSIGNED DEFAULT NULL,
    approved_at         DATETIME DEFAULT NULL,
    recorded_by         INT UNSIGNED NOT NULL,
    notes               TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME DEFAULT NULL,
    KEY idx_tx_parish (parish_id),
    KEY idx_tx_type (type),
    KEY idx_tx_date (transaction_date),
    KEY idx_tx_category (category_id),
    KEY idx_tx_status (status),
    KEY idx_tx_member (member_id),
    KEY idx_tx_community (community_id),
    FOREIGN KEY (category_id) REFERENCES transaction_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE approvals (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    entity_type     VARCHAR(60) NOT NULL,
    entity_id       INT UNSIGNED NOT NULL,
    action          ENUM('approve','reject') NOT NULL,
    reason          TEXT,
    approved_by     INT UNSIGNED NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_approval_entity (entity_type, entity_id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE receipts (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    transaction_id  INT UNSIGNED NOT NULL,
    receipt_no      VARCHAR(60) NOT NULL UNIQUE,
    qr_code         VARCHAR(100) UNIQUE,
    issued_to       VARCHAR(150),
    amount          DECIMAL(15,2) NOT NULL,
    issued_by       INT UNSIGNED NOT NULL,
    issued_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    voided          TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE budgets (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    category_id     INT UNSIGNED DEFAULT NULL,
    account_id      INT UNSIGNED DEFAULT NULL,
    fiscal_year     YEAR NOT NULL,
    period          ENUM('annual','q1','q2','q3','q4','january','february','march','april','may','june','july','august','september','october','november','december') NOT NULL DEFAULT 'annual',
    amount          DECIMAL(15,2) NOT NULL,
    notes           TEXT,
    created_by      INT UNSIGNED NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_budget_parish (parish_id),
    KEY idx_budget_year (fiscal_year),
    FOREIGN KEY (category_id) REFERENCES transaction_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reconciliations (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    account_id      INT UNSIGNED NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    book_balance    DECIMAL(15,2) NOT NULL,
    bank_balance    DECIMAL(15,2) NOT NULL,
    difference      DECIMAL(15,2) GENERATED ALWAYS AS (bank_balance - book_balance) STORED,
    status          ENUM('open','reconciled') NOT NULL DEFAULT 'open',
    notes           TEXT,
    reconciled_by   INT UNSIGNED DEFAULT NULL,
    reconciled_at   DATETIME DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
    FOREIGN KEY (reconciled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reconciliation_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    statement_date  DATE NOT NULL,
    description     VARCHAR(500) NOT NULL DEFAULT '',
    amount          DECIMAL(15,2) NOT NULL,
    type            ENUM('credit','debit') NOT NULL,
    status          ENUM('unmatched','matched','reconciled') NOT NULL DEFAULT 'unmatched',
    transaction_id  INT UNSIGNED NULL,
    reconciled_by   INT UNSIGNED NULL,
    reconciled_at   DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ri_parish_month (parish_id, statement_date),
    INDEX idx_ri_status       (parish_id, status),
    INDEX idx_ri_tx           (transaction_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    FOREIGN KEY (reconciled_by)  REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- FUNDRAISING
-- ============================================================

CREATE TABLE campaigns (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    target_amount   DECIMAL(15,2),
    start_date      DATE,
    end_date        DATE,
    cover_image     VARCHAR(300),
    status          ENUM('draft','active','completed','cancelled') NOT NULL DEFAULT 'draft',
    visible_public  TINYINT(1) NOT NULL DEFAULT 0,
    created_by      INT UNSIGNED NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_campaign_parish (parish_id),
    KEY idx_campaign_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE campaign_contributions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    campaign_id     INT UNSIGNED NOT NULL,
    transaction_id  INT UNSIGNED DEFAULT NULL,
    member_id       INT UNSIGNED DEFAULT NULL,
    community_id    INT UNSIGNED DEFAULT NULL,
    donor_name      VARCHAR(150),
    amount          DECIMAL(15,2) NOT NULL,
    anonymous       TINYINT(1) NOT NULL DEFAULT 0,
    pledged         TINYINT(1) NOT NULL DEFAULT 0,
    paid_at         DATETIME DEFAULT NULL,
    notes           TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_contrib_campaign (campaign_id),
    KEY idx_contrib_member (member_id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pledges (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    campaign_id     INT UNSIGNED NOT NULL,
    member_id       INT UNSIGNED DEFAULT NULL,
    donor_name      VARCHAR(150),
    amount_pledged  DECIMAL(15,2) NOT NULL,
    amount_paid     DECIMAL(15,2) NOT NULL DEFAULT 0,
    due_date        DATE,
    status          ENUM('pending','partial','fulfilled','defaulted') NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTIFICATIONS (Phase 1 — logs only)
-- ============================================================

CREATE TABLE notification_preferences (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED DEFAULT NULL,
    member_id   INT UNSIGNED DEFAULT NULL,
    channel     ENUM('whatsapp','sms','email') NOT NULL,
    enabled     TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_logs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    channel         ENUM('whatsapp','sms','email') NOT NULL,
    recipient       VARCHAR(200) NOT NULL,
    subject         VARCHAR(300),
    body            TEXT NOT NULL,
    status          ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
    provider_ref    VARCHAR(200),
    error_message   TEXT,
    sent_at         DATETIME DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notif_parish (parish_id),
    KEY idx_notif_channel (channel),
    KEY idx_notif_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DOCUMENTS (Phase 1 — basic)
-- ============================================================

CREATE TABLE document_categories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    name        VARCHAR(100) NOT NULL,
    parent_id   INT UNSIGNED DEFAULT NULL,
    FOREIGN KEY (parent_id) REFERENCES document_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO document_categories (parish_id, name) VALUES
(1, 'Barua'),
(1, 'Mikutano'),
(1, 'Fedha'),
(1, 'Kanuni'),
(1, 'Mengineyo');

CREATE TABLE documents (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL DEFAULT 1,
    category_id     INT UNSIGNED DEFAULT NULL,
    title           VARCHAR(250) NOT NULL,
    description     TEXT,
    file_path       VARCHAR(300) NOT NULL,
    file_size       INT UNSIGNED,
    file_type       VARCHAR(60),
    access_level    ENUM('public','internal','restricted') NOT NULL DEFAULT 'internal',
    uploaded_by     INT UNSIGNED NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at      DATETIME DEFAULT NULL,
    KEY idx_doc_parish (parish_id),
    FULLTEXT KEY ft_doc_title (title),
    FOREIGN KEY (category_id) REFERENCES document_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;
