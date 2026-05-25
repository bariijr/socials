-- ============================================================
-- KANEGEJI PARISH ERP — ADD MISSING TABLES (Phases 2–8)
-- Safe to run against an existing Phase-1 database.
-- All statements use CREATE TABLE IF NOT EXISTS / INSERT IGNORE.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+03:00';
SET foreign_key_checks = 0;

-- ============================================================
-- FUNDRAISING (Phase 2+)
-- ============================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id      INT UNSIGNED NOT NULL DEFAULT 1,
    title          VARCHAR(200) NOT NULL,
    description    TEXT,
    target_amount  DECIMAL(15,2),
    start_date     DATE,
    end_date       DATE,
    cover_image    VARCHAR(300),
    status         ENUM('draft','active','completed','cancelled') NOT NULL DEFAULT 'draft',
    visible_public TINYINT(1) NOT NULL DEFAULT 0,
    created_by     INT UNSIGNED NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_campaign_parish (parish_id),
    KEY idx_campaign_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_contributions (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id      INT UNSIGNED NOT NULL DEFAULT 1,
    campaign_id    INT UNSIGNED NOT NULL,
    transaction_id INT UNSIGNED DEFAULT NULL,
    member_id      INT UNSIGNED DEFAULT NULL,
    community_id   INT UNSIGNED DEFAULT NULL,
    donor_name     VARCHAR(150),
    amount         DECIMAL(15,2) NOT NULL,
    anonymous      TINYINT(1) NOT NULL DEFAULT 0,
    pledged        TINYINT(1) NOT NULL DEFAULT 0,
    paid_at        DATETIME DEFAULT NULL,
    notes          TEXT,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_contrib_campaign (campaign_id),
    KEY idx_contrib_member (member_id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pledges (
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

CREATE TABLE IF NOT EXISTS online_donations (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id        INT UNSIGNED NOT NULL DEFAULT 1,
    campaign_id      INT UNSIGNED NULL,
    donor_name       VARCHAR(150) NULL,
    donor_phone      VARCHAR(30) NULL,
    donor_email      VARCHAR(150) NULL,
    amount           DECIMAL(15,2) NOT NULL,
    currency         VARCHAR(10) NOT NULL DEFAULT 'TZS',
    payment_method   VARCHAR(50) NULL,
    reference_number VARCHAR(100) NULL,
    proof_file       VARCHAR(255) NULL,
    status           ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    notes            TEXT NULL,
    verified_by      INT UNSIGNED NULL,
    verified_at      DATETIME NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id)   REFERENCES parishes(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
    INDEX idx_donations_parish (parish_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CONTENT — announcements, mass schedules, catholic content
-- (Phase 6)
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id    INT UNSIGNED NOT NULL DEFAULT 1,
    title        VARCHAR(255) NOT NULL,
    content      TEXT NOT NULL,
    type         ENUM('general','liturgical','event','urgent') NOT NULL DEFAULT 'general',
    published_at DATETIME NULL,
    expires_at   DATETIME NULL,
    active       TINYINT(1) NOT NULL DEFAULT 1,
    published_by INT UNSIGNED NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id)    REFERENCES parishes(id),
    FOREIGN KEY (published_by) REFERENCES users(id),
    INDEX idx_announcements_parish (parish_id, active, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mass_schedules (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id    INT UNSIGNED NOT NULL DEFAULT 1,
    day_of_week  TINYINT NOT NULL COMMENT '0=Sun 1=Mon … 6=Sat',
    mass_time    TIME NOT NULL,
    location     VARCHAR(150) NULL,
    language     ENUM('sw','en','latin','other') NOT NULL DEFAULT 'sw',
    is_special   TINYINT(1) NOT NULL DEFAULT 0,
    special_note VARCHAR(255) NULL,
    active       TINYINT(1) NOT NULL DEFAULT 1,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id) REFERENCES parishes(id),
    INDEX idx_mass_parish (parish_id, day_of_week, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default mass schedule (safe: INSERT IGNORE on a table with no UNIQUE key
-- would insert duplicates, so only run if the table was just created / is empty)
INSERT INTO mass_schedules (parish_id, day_of_week, mass_time, location, language, sort_order)
SELECT 1, 0, '07:00:00', 'Kanisa Kuu', 'sw', 1 WHERE NOT EXISTS (SELECT 1 FROM mass_schedules WHERE parish_id=1);

INSERT IGNORE INTO mass_schedules (parish_id, day_of_week, mass_time, location, language, sort_order) VALUES
(1, 0, '09:00:00', 'Kanisa Kuu', 'sw', 2),
(1, 0, '11:00:00', 'Kanisa Kuu', 'en', 3),
(1, 3, '06:30:00', 'Kanisa Kuu', 'sw', 4),
(1, 5, '06:30:00', 'Kanisa Kuu', 'sw', 5);

CREATE TABLE IF NOT EXISTS catholic_content (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id  INT UNSIGNED NULL COMMENT 'NULL = global content',
    type       ENUM('prayer','reading','devotion','novena','catechism','saint') NOT NULL,
    title      VARCHAR(255) NOT NULL,
    content    MEDIUMTEXT NOT NULL,
    language   ENUM('sw','en') NOT NULL DEFAULT 'sw',
    feast_date DATE NULL,
    active     TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_catholic_type (type, language, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAYMENTS — Selcom/mobile money gateway (Phase 6)
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id    INT UNSIGNED NOT NULL DEFAULT 1,
    member_id    INT UNSIGNED NULL,
    external_id  VARCHAR(100) NOT NULL UNIQUE,
    provider     ENUM('mpesa','tigopesa','airtelmoney','halopesa','bank') NOT NULL,
    phone        VARCHAR(20) NOT NULL,
    amount       DECIMAL(15,2) NOT NULL,
    currency     VARCHAR(5) DEFAULT 'TZS',
    purpose      ENUM('donation','pledge','event_ticket','other') DEFAULT 'donation',
    reference_id INT UNSIGNED NULL,
    status       ENUM('pending','completed','failed','cancelled') DEFAULT 'pending',
    gateway_ref  VARCHAR(200) NULL,
    gateway_resp JSON NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payments_parish (parish_id),
    INDEX idx_payments_status (status),
    INDEX idx_payments_ext (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- WEB PUSH / 2FA (Phase 6)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_push (user_id, endpoint(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS totp_secrets (
    user_id      INT UNSIGNED NOT NULL PRIMARY KEY,
    secret       VARCHAR(64) NOT NULL,
    enabled      TINYINT(1) DEFAULT 0,
    backup_codes JSON NULL,
    enabled_at   TIMESTAMP NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMMITTEES (Phase 6)
-- ============================================================

CREATE TABLE IF NOT EXISTS committees (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id      INT UNSIGNED NOT NULL DEFAULT 1,
    name           VARCHAR(150) NOT NULL,
    description    TEXT NULL,
    type           ENUM('pastoral','liturgical','finance','outreach','youth','women','other') DEFAULT 'other',
    chairperson_id INT UNSIGNED NULL,
    active         TINYINT(1) DEFAULT 1,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP NULL,
    INDEX idx_committees_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS committee_members (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    committee_id INT UNSIGNED NOT NULL,
    member_id    INT UNSIGNED NOT NULL,
    role         VARCHAR(100) NULL,
    joined_at    DATE NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_committee_member (committee_id, member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTIFICATION BROADCASTS (Phase 3+)
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_broadcasts (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id    INT UNSIGNED NOT NULL,
    title        VARCHAR(200) NOT NULL,
    message      TEXT NOT NULL,
    audience     ENUM('all','community','role','custom') NOT NULL DEFAULT 'all',
    audience_id  INT UNSIGNED NULL,
    channel      SET('whatsapp','sms','email') NOT NULL DEFAULT 'sms',
    total_sent   INT UNSIGNED NOT NULL DEFAULT 0,
    total_failed INT UNSIGNED NOT NULL DEFAULT 0,
    status       ENUM('draft','sending','completed','failed') NOT NULL DEFAULT 'draft',
    sent_by      INT UNSIGNED NOT NULL,
    sent_at      DATETIME NULL,
    created_at   DATETIME NOT NULL,
    updated_at   DATETIME NOT NULL,
    INDEX idx_broadcast_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEMBER APPLICATIONS (Phase 3+)
-- ============================================================

CREATE TABLE IF NOT EXISTS member_applications (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id           INT UNSIGNED NOT NULL DEFAULT 1,
    first_name          VARCHAR(80) NOT NULL,
    last_name           VARCHAR(80) NOT NULL,
    middle_name         VARCHAR(80) NULL,
    gender              ENUM('male','female','other') NOT NULL,
    date_of_birth       DATE NULL,
    phone               VARCHAR(30) NULL,
    email               VARCHAR(150) NULL,
    community_id        INT UNSIGNED NULL,
    community_name      VARCHAR(150) NULL,
    address             TEXT NULL,
    marriage_status     ENUM('single','married','widowed','divorced','religious') DEFAULT 'single',
    occupation          VARCHAR(100) NULL,
    notes               TEXT NULL,
    status              ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reviewed_by         INT UNSIGNED NULL,
    reviewed_at         DATETIME NULL,
    rejection_reason    TEXT NULL,
    converted_member_id INT UNSIGNED NULL,
    created_at          DATETIME NOT NULL,
    INDEX idx_app_parish (parish_id),
    INDEX idx_app_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AI (Phase 5+)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_conversations (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id  INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    title      VARCHAR(200) NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_ai_conv_parish (parish_id),
    INDEX idx_ai_conv_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    role            ENUM('user','assistant','system') NOT NULL,
    content         TEXT NOT NULL,
    tokens_used     INT UNSIGNED NULL,
    created_at      DATETIME NOT NULL,
    INDEX idx_ai_msg_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_knowledge (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    title       VARCHAR(255) NOT NULL,
    content     MEDIUMTEXT NOT NULL,
    type        ENUM('document','faq','procedure','policy','other') NOT NULL DEFAULT 'document',
    source_file VARCHAR(255) NULL,
    word_count  INT NOT NULL DEFAULT 0,
    tags        VARCHAR(500) NULL,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_by  INT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id)  REFERENCES parishes(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FULLTEXT KEY ft_knowledge_search (title, content),
    INDEX idx_knowledge_parish (parish_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BUDGET ALERTS (Phase 5+)
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_alerts (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    budget_id  INT UNSIGNED NOT NULL,
    parish_id  INT UNSIGNED NOT NULL,
    threshold  TINYINT UNSIGNED NOT NULL DEFAULT 80,
    is_sent    TINYINT(1) NOT NULL DEFAULT 0,
    sent_at    DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_budget_alert (budget_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DOCUMENTS (Phase 4+)
-- ============================================================

CREATE TABLE IF NOT EXISTS document_categories (
    id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id INT UNSIGNED NOT NULL DEFAULT 1,
    name      VARCHAR(100) NOT NULL,
    parent_id INT UNSIGNED DEFAULT NULL,
    FOREIGN KEY (parent_id) REFERENCES document_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO document_categories (id, parish_id, name) VALUES
(1, 1, 'Barua'),
(2, 1, 'Mikutano'),
(3, 1, 'Fedha'),
(4, 1, 'Kanuni'),
(5, 1, 'Mengineyo');

CREATE TABLE IF NOT EXISTS documents (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id    INT UNSIGNED NOT NULL DEFAULT 1,
    category_id  INT UNSIGNED DEFAULT NULL,
    title        VARCHAR(250) NOT NULL,
    description  TEXT,
    file_path    VARCHAR(300) NOT NULL,
    file_size    INT UNSIGNED,
    file_type    VARCHAR(60),
    access_level ENUM('public','internal','restricted') NOT NULL DEFAULT 'internal',
    uploaded_by  INT UNSIGNED NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at   DATETIME DEFAULT NULL,
    KEY idx_doc_parish (parish_id),
    FULLTEXT KEY ft_doc_title (title),
    FOREIGN KEY (category_id) REFERENCES document_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAYROLL (Phase 5+)
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id        INT UNSIGNED NOT NULL,
    member_id        INT UNSIGNED NULL,
    employee_number  VARCHAR(30) NOT NULL,
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100) NOT NULL,
    gender           ENUM('male','female') NOT NULL,
    dob              DATE NULL,
    phone            VARCHAR(20) NULL,
    email            VARCHAR(150) NULL,
    position         VARCHAR(100) NOT NULL,
    department       VARCHAR(100) NULL,
    employment_type  ENUM('full_time','part_time','contract','volunteer') NOT NULL DEFAULT 'full_time',
    employment_start DATE NOT NULL,
    employment_end   DATE NULL,
    bank_name        VARCHAR(100) NULL,
    bank_account     VARCHAR(50) NULL,
    nssf_number      VARCHAR(30) NULL,
    tin_number       VARCHAR(30) NULL,
    status           ENUM('active','inactive','terminated') NOT NULL DEFAULT 'active',
    notes            TEXT NULL,
    created_at       DATETIME NOT NULL,
    updated_at       DATETIME NOT NULL,
    deleted_at       DATETIME NULL,
    INDEX idx_employees_parish (parish_id),
    INDEX idx_employees_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salary_structures (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id           INT UNSIGNED NOT NULL,
    employee_id         INT UNSIGNED NOT NULL,
    basic_salary        DECIMAL(12,2) NOT NULL DEFAULT 0,
    housing_allowance   DECIMAL(12,2) NOT NULL DEFAULT 0,
    transport_allowance DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_allowances    DECIMAL(12,2) NOT NULL DEFAULT 0,
    nssf_employee       DECIMAL(12,2) NOT NULL DEFAULT 0,
    nssf_employer       DECIMAL(12,2) NOT NULL DEFAULT 0,
    paye                DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_deductions    DECIMAL(12,2) NOT NULL DEFAULT 0,
    effective_from      DATE NOT NULL,
    effective_to        DATE NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          DATETIME NOT NULL,
    updated_at          DATETIME NOT NULL,
    INDEX idx_salary_employee (employee_id),
    INDEX idx_salary_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id        INT UNSIGNED NOT NULL,
    run_number       VARCHAR(30) NOT NULL,
    period_month     TINYINT UNSIGNED NOT NULL,
    period_year      SMALLINT UNSIGNED NOT NULL,
    total_gross      DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_net        DECIMAL(14,2) NOT NULL DEFAULT 0,
    employee_count   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    status           ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
    approved_by      INT UNSIGNED NULL,
    approved_at      DATETIME NULL,
    paid_at          DATETIME NULL,
    notes            TEXT NULL,
    created_by       INT UNSIGNED NOT NULL,
    created_at       DATETIME NOT NULL,
    updated_at       DATETIME NOT NULL,
    UNIQUE KEY uq_run_period (parish_id, period_month, period_year),
    INDEX idx_payroll_runs_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_run_items (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payroll_run_id      INT UNSIGNED NOT NULL,
    employee_id         INT UNSIGNED NOT NULL,
    basic_salary        DECIMAL(12,2) NOT NULL DEFAULT 0,
    housing_allowance   DECIMAL(12,2) NOT NULL DEFAULT 0,
    transport_allowance DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_allowances    DECIMAL(12,2) NOT NULL DEFAULT 0,
    gross_pay           DECIMAL(12,2) NOT NULL DEFAULT 0,
    nssf_employee       DECIMAL(12,2) NOT NULL DEFAULT 0,
    nssf_employer       DECIMAL(12,2) NOT NULL DEFAULT 0,
    paye                DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_deductions    DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_deductions    DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_pay             DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_status      ENUM('pending','paid') NOT NULL DEFAULT 'pending',
    paid_at             DATETIME NULL,
    INDEX idx_payroll_items_run (payroll_run_id),
    INDEX idx_payroll_items_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INVENTORY / ASSETS (Phase 5+)
-- ============================================================

CREATE TABLE IF NOT EXISTS asset_categories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT NULL,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    INDEX idx_asset_cat_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO asset_categories (id, parish_id, name, description, created_at, updated_at) VALUES
(1, 1, 'Majengo',    'Majengo na miundombinu ya parokia', NOW(), NOW()),
(2, 1, 'Samani',     'Viti, meza, na samani nyingine',    NOW(), NOW()),
(3, 1, 'Teknolojia', 'Kompyuta, printa, na vifaa vya IT', NOW(), NOW()),
(4, 1, 'Magari',     'Magari na pikipiki za parokia',     NOW(), NOW()),
(5, 1, 'Kanisa',     'Vifaa vya ibada na kanisa',         NOW(), NOW());

CREATE TABLE IF NOT EXISTS assets (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id        INT UNSIGNED NOT NULL,
    asset_number     VARCHAR(30) NOT NULL,
    name             VARCHAR(150) NOT NULL,
    category_id      INT UNSIGNED NULL,
    description      TEXT NULL,
    serial_number    VARCHAR(100) NULL,
    purchase_date    DATE NULL,
    purchase_price   DECIMAL(12,2) NULL,
    current_value    DECIMAL(12,2) NULL,
    supplier         VARCHAR(150) NULL,
    location         VARCHAR(150) NULL,
    assigned_to      INT UNSIGNED NULL,
    condition_status ENUM('excellent','good','fair','poor','disposed') NOT NULL DEFAULT 'good',
    qr_code          VARCHAR(60) NULL,
    image_path       VARCHAR(255) NULL,
    warranty_expiry  DATE NULL,
    notes            TEXT NULL,
    status           ENUM('active','maintenance','disposed') NOT NULL DEFAULT 'active',
    created_at       DATETIME NOT NULL,
    updated_at       DATETIME NOT NULL,
    deleted_at       DATETIME NULL,
    INDEX idx_assets_parish (parish_id),
    INDEX idx_assets_category (category_id),
    INDEX idx_assets_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_logs (
    id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id              INT UNSIGNED NOT NULL,
    parish_id             INT UNSIGNED NOT NULL,
    maintenance_date      DATE NOT NULL,
    type                  ENUM('preventive','corrective','inspection') NOT NULL DEFAULT 'preventive',
    description           TEXT NOT NULL,
    cost                  DECIMAL(10,2) NOT NULL DEFAULT 0,
    performed_by          VARCHAR(150) NULL,
    next_maintenance_date DATE NULL,
    status                ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'completed',
    created_by            INT UNSIGNED NOT NULL,
    created_at            DATETIME NOT NULL,
    INDEX idx_maintenance_asset (asset_id),
    INDEX idx_maintenance_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EVENTS (Phase 5+)
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
    id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id             INT UNSIGNED NOT NULL,
    event_number          VARCHAR(30) NOT NULL,
    title                 VARCHAR(200) NOT NULL,
    description           TEXT NULL,
    event_type            ENUM('mass','meeting','fundraiser','concert','wedding','burial','other') NOT NULL DEFAULT 'other',
    location              VARCHAR(200) NULL,
    start_datetime        DATETIME NOT NULL,
    end_datetime          DATETIME NULL,
    max_capacity          SMALLINT UNSIGNED NULL,
    ticket_price          DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_free               TINYINT(1) NOT NULL DEFAULT 1,
    requires_registration TINYINT(1) NOT NULL DEFAULT 0,
    image_path            VARCHAR(255) NULL,
    status                ENUM('draft','published','cancelled','completed') NOT NULL DEFAULT 'draft',
    created_by            INT UNSIGNED NOT NULL,
    created_at            DATETIME NOT NULL,
    updated_at            DATETIME NOT NULL,
    INDEX idx_events_parish (parish_id),
    INDEX idx_events_status (status),
    INDEX idx_events_start (start_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_tickets (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id          INT UNSIGNED NOT NULL,
    parish_id         INT UNSIGNED NOT NULL,
    ticket_number     VARCHAR(40) NOT NULL,
    qr_code           VARCHAR(60) NOT NULL,
    holder_name       VARCHAR(200) NOT NULL,
    holder_phone      VARCHAR(20) NULL,
    holder_email      VARCHAR(150) NULL,
    member_id         INT UNSIGNED NULL,
    ticket_type       ENUM('standard','vip','child') NOT NULL DEFAULT 'standard',
    price_paid        DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method    VARCHAR(50) NULL,
    payment_reference VARCHAR(100) NULL,
    is_paid           TINYINT(1) NOT NULL DEFAULT 0,
    is_used           TINYINT(1) NOT NULL DEFAULT 0,
    used_at           DATETIME NULL,
    issued_at         DATETIME NOT NULL,
    UNIQUE KEY uq_ticket_qr (qr_code),
    INDEX idx_tickets_event (event_id),
    INDEX idx_tickets_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- HALL BOOKINGS (Phase 5+)
-- ============================================================

CREATE TABLE IF NOT EXISTS halls (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL,
    name        VARCHAR(100) NOT NULL,
    capacity    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    description TEXT NULL,
    hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    daily_rate  DECIMAL(10,2) NOT NULL DEFAULT 0,
    amenities   JSON NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    INDEX idx_halls_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO halls (id, parish_id, name, capacity, description, hourly_rate, daily_rate, is_active, created_at, updated_at) VALUES
(1, 1, 'Ukumbi Mkuu',         300, 'Ukumbi mkubwa wa parokia kwa mikutano na sherehe', 50000, 300000, 1, NOW(), NOW()),
(2, 1, 'Chumba cha Mikutano',  50, 'Chumba kidogo kwa vikao vya bodi na kamati',       20000, 100000, 1, NOW(), NOW());

CREATE TABLE IF NOT EXISTS hall_bookings (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id        INT UNSIGNED NOT NULL,
    booking_number   VARCHAR(30) NOT NULL,
    hall_id          INT UNSIGNED NOT NULL,
    booker_name      VARCHAR(200) NOT NULL,
    booker_phone     VARCHAR(20) NOT NULL,
    booker_email     VARCHAR(150) NULL,
    member_id        INT UNSIGNED NULL,
    purpose          VARCHAR(300) NOT NULL,
    event_type       VARCHAR(100) NULL,
    start_datetime   DATETIME NOT NULL,
    end_datetime     DATETIME NOT NULL,
    expected_guests  SMALLINT UNSIGNED NULL,
    total_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
    deposit_paid     DECIMAL(10,2) NOT NULL DEFAULT 0,
    balance_due      DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_status   ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
    status           ENUM('pending','approved','rejected','cancelled','completed') NOT NULL DEFAULT 'pending',
    approved_by      INT UNSIGNED NULL,
    approved_at      DATETIME NULL,
    rejection_reason TEXT NULL,
    notes            TEXT NULL,
    created_by       INT UNSIGNED NOT NULL,
    created_at       DATETIME NOT NULL,
    updated_at       DATETIME NOT NULL,
    INDEX idx_bookings_parish (parish_id),
    INDEX idx_bookings_hall (hall_id),
    INDEX idx_bookings_status (status),
    INDEX idx_bookings_dates (start_datetime, end_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANK RECONCILIATION (Phase 8)
-- ============================================================

CREATE TABLE IF NOT EXISTS reconciliations (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id     INT UNSIGNED NOT NULL DEFAULT 1,
    account_id    INT UNSIGNED NOT NULL,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    book_balance  DECIMAL(15,2) NOT NULL,
    bank_balance  DECIMAL(15,2) NOT NULL,
    difference    DECIMAL(15,2) GENERATED ALWAYS AS (bank_balance - book_balance) STORED,
    status        ENUM('open','reconciled') NOT NULL DEFAULT 'open',
    notes         TEXT,
    reconciled_by INT UNSIGNED DEFAULT NULL,
    reconciled_at DATETIME DEFAULT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
    FOREIGN KEY (reconciled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reconciliation_items (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id      INT UNSIGNED NOT NULL DEFAULT 1,
    statement_date DATE NOT NULL,
    description    VARCHAR(500) NOT NULL DEFAULT '',
    amount         DECIMAL(15,2) NOT NULL,
    type           ENUM('credit','debit') NOT NULL,
    status         ENUM('unmatched','matched','reconciled') NOT NULL DEFAULT 'unmatched',
    transaction_id INT UNSIGNED NULL,
    reconciled_by  INT UNSIGNED NULL,
    reconciled_at  DATETIME NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ri_parish_month (parish_id, statement_date),
    INDEX idx_ri_status       (parish_id, status),
    INDEX idx_ri_tx           (transaction_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    FOREIGN KEY (reconciled_by)  REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- RECEIPTS / APPROVALS (if missing from Phase 1)
-- ============================================================

CREATE TABLE IF NOT EXISTS approvals (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT UNSIGNED NOT NULL DEFAULT 1,
    entity_type VARCHAR(60) NOT NULL,
    entity_id   INT UNSIGNED NOT NULL,
    action      ENUM('approve','reject') NOT NULL,
    reason      TEXT,
    approved_by INT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_approval_entity (entity_type, entity_id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipts (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id      INT UNSIGNED NOT NULL DEFAULT 1,
    transaction_id INT UNSIGNED NOT NULL,
    receipt_no     VARCHAR(60) NOT NULL UNIQUE,
    qr_code        VARCHAR(100) UNIQUE,
    issued_to      VARCHAR(150),
    amount         DECIMAL(15,2) NOT NULL,
    issued_by      INT UNSIGNED NOT NULL,
    issued_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    voided         TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;
