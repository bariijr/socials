-- Phase 2 Schema Migration
-- Run after 001-initial-schema.sql

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────
-- PAYROLL
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `employees` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `member_id` INT UNSIGNED NULL,
  `employee_number` VARCHAR(30) NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `gender` ENUM('male','female') NOT NULL,
  `dob` DATE NULL,
  `phone` VARCHAR(20) NULL,
  `email` VARCHAR(150) NULL,
  `position` VARCHAR(100) NOT NULL,
  `department` VARCHAR(100) NULL,
  `employment_type` ENUM('full_time','part_time','contract','volunteer') NOT NULL DEFAULT 'full_time',
  `employment_start` DATE NOT NULL,
  `employment_end` DATE NULL,
  `bank_name` VARCHAR(100) NULL,
  `bank_account` VARCHAR(50) NULL,
  `nssf_number` VARCHAR(30) NULL,
  `tin_number` VARCHAR(30) NULL,
  `status` ENUM('active','inactive','terminated') NOT NULL DEFAULT 'active',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `deleted_at` DATETIME NULL,
  INDEX `idx_employees_parish` (`parish_id`),
  INDEX `idx_employees_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `salary_structures` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `employee_id` INT UNSIGNED NOT NULL,
  `basic_salary` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `housing_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `transport_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `other_allowances` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `nssf_employee` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `nssf_employer` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `paye` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `other_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_salary_employee` (`employee_id`),
  INDEX `idx_salary_parish` (`parish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_runs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `run_number` VARCHAR(30) NOT NULL,
  `period_month` TINYINT UNSIGNED NOT NULL,
  `period_year` SMALLINT UNSIGNED NOT NULL,
  `total_gross` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `total_deductions` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `total_net` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `employee_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
  `approved_by` INT UNSIGNED NULL,
  `approved_at` DATETIME NULL,
  `paid_at` DATETIME NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  UNIQUE KEY `uq_run_period` (`parish_id`, `period_month`, `period_year`),
  INDEX `idx_payroll_runs_parish` (`parish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_run_items` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `payroll_run_id` INT UNSIGNED NOT NULL,
  `employee_id` INT UNSIGNED NOT NULL,
  `basic_salary` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `housing_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `transport_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `other_allowances` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `gross_pay` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `nssf_employee` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `nssf_employer` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `paye` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `other_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `net_pay` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `payment_status` ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  `paid_at` DATETIME NULL,
  INDEX `idx_payroll_items_run` (`payroll_run_id`),
  INDEX `idx_payroll_items_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- INVENTORY / ASSETS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `asset_categories` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_asset_cat_parish` (`parish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assets` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `asset_number` VARCHAR(30) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `category_id` INT UNSIGNED NULL,
  `description` TEXT NULL,
  `serial_number` VARCHAR(100) NULL,
  `purchase_date` DATE NULL,
  `purchase_price` DECIMAL(12,2) NULL,
  `current_value` DECIMAL(12,2) NULL,
  `supplier` VARCHAR(150) NULL,
  `location` VARCHAR(150) NULL,
  `assigned_to` INT UNSIGNED NULL,
  `condition_status` ENUM('excellent','good','fair','poor','disposed') NOT NULL DEFAULT 'good',
  `qr_code` VARCHAR(60) NULL,
  `image_path` VARCHAR(255) NULL,
  `warranty_expiry` DATE NULL,
  `notes` TEXT NULL,
  `status` ENUM('active','maintenance','disposed') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `deleted_at` DATETIME NULL,
  INDEX `idx_assets_parish` (`parish_id`),
  INDEX `idx_assets_category` (`category_id`),
  INDEX `idx_assets_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenance_logs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id` INT UNSIGNED NOT NULL,
  `parish_id` INT UNSIGNED NOT NULL,
  `maintenance_date` DATE NOT NULL,
  `type` ENUM('preventive','corrective','inspection') NOT NULL DEFAULT 'preventive',
  `description` TEXT NOT NULL,
  `cost` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `performed_by` VARCHAR(150) NULL,
  `next_maintenance_date` DATE NULL,
  `status` ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'completed',
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL,
  INDEX `idx_maintenance_asset` (`asset_id`),
  INDEX `idx_maintenance_parish` (`parish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- EVENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `events` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `event_number` VARCHAR(30) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `event_type` ENUM('mass','meeting','fundraiser','concert','wedding','burial','other') NOT NULL DEFAULT 'other',
  `location` VARCHAR(200) NULL,
  `start_datetime` DATETIME NOT NULL,
  `end_datetime` DATETIME NULL,
  `max_capacity` SMALLINT UNSIGNED NULL,
  `ticket_price` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `is_free` TINYINT(1) NOT NULL DEFAULT 1,
  `requires_registration` TINYINT(1) NOT NULL DEFAULT 0,
  `image_path` VARCHAR(255) NULL,
  `status` ENUM('draft','published','cancelled','completed') NOT NULL DEFAULT 'draft',
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_events_parish` (`parish_id`),
  INDEX `idx_events_status` (`status`),
  INDEX `idx_events_start` (`start_datetime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `event_tickets` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `event_id` INT UNSIGNED NOT NULL,
  `parish_id` INT UNSIGNED NOT NULL,
  `ticket_number` VARCHAR(40) NOT NULL,
  `qr_code` VARCHAR(60) NOT NULL,
  `holder_name` VARCHAR(200) NOT NULL,
  `holder_phone` VARCHAR(20) NULL,
  `holder_email` VARCHAR(150) NULL,
  `member_id` INT UNSIGNED NULL,
  `ticket_type` ENUM('standard','vip','child') NOT NULL DEFAULT 'standard',
  `price_paid` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `payment_method` VARCHAR(50) NULL,
  `payment_reference` VARCHAR(100) NULL,
  `is_paid` TINYINT(1) NOT NULL DEFAULT 0,
  `is_used` TINYINT(1) NOT NULL DEFAULT 0,
  `used_at` DATETIME NULL,
  `issued_at` DATETIME NOT NULL,
  UNIQUE KEY `uq_ticket_qr` (`qr_code`),
  INDEX `idx_tickets_event` (`event_id`),
  INDEX `idx_tickets_parish` (`parish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- HALL BOOKINGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `halls` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `capacity` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `hourly_rate` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `daily_rate` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `amenities` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_halls_parish` (`parish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hall_bookings` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id` INT UNSIGNED NOT NULL,
  `booking_number` VARCHAR(30) NOT NULL,
  `hall_id` INT UNSIGNED NOT NULL,
  `booker_name` VARCHAR(200) NOT NULL,
  `booker_phone` VARCHAR(20) NOT NULL,
  `booker_email` VARCHAR(150) NULL,
  `member_id` INT UNSIGNED NULL,
  `purpose` VARCHAR(300) NOT NULL,
  `event_type` VARCHAR(100) NULL,
  `start_datetime` DATETIME NOT NULL,
  `end_datetime` DATETIME NOT NULL,
  `expected_guests` SMALLINT UNSIGNED NULL,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `deposit_paid` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `balance_due` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `payment_status` ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
  `status` ENUM('pending','approved','rejected','cancelled','completed') NOT NULL DEFAULT 'pending',
  `approved_by` INT UNSIGNED NULL,
  `approved_at` DATETIME NULL,
  `rejection_reason` TEXT NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_bookings_parish` (`parish_id`),
  INDEX `idx_bookings_hall` (`hall_id`),
  INDEX `idx_bookings_status` (`status`),
  INDEX `idx_bookings_dates` (`start_datetime`, `end_datetime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- DEFAULT DATA
-- ─────────────────────────────────────────────

-- Seed asset categories for parish 1
INSERT IGNORE INTO `asset_categories` (`parish_id`,`name`,`description`,`created_at`,`updated_at`) VALUES
(1,'Majengo','Majengo na miundombinu ya parokia',NOW(),NOW()),
(1,'Samani','Viti, meza, na samani nyingine',NOW(),NOW()),
(1,'Teknolojia','Kompyuta, printa, na vifaa vya IT',NOW(),NOW()),
(1,'Magari','Magari na pikipiki za parokia',NOW(),NOW()),
(1,'Kanisa','Vifaa vya ibada na kanisa',NOW(),NOW());

-- Seed halls for parish 1
INSERT IGNORE INTO `halls` (`parish_id`,`name`,`capacity`,`description`,`hourly_rate`,`daily_rate`,`is_active`,`created_at`,`updated_at`) VALUES
(1,'Ukumbi Mkuu',300,'Ukumbi mkubwa wa parokia kwa mikutano na sherehe',50000,300000,1,NOW(),NOW()),
(1,'Chumba cha Mikutano',50,'Chumba kidogo kwa vikao vya bodi na kamati',20000,100000,1,NOW(),NOW());

SET FOREIGN_KEY_CHECKS = 1;
