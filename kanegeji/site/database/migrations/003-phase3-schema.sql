-- Phase 3 Schema Migration
-- Run after 002-phase2-schema.sql

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────
-- Extend notification_logs with missing columns
-- ─────────────────────────────────────────────
ALTER TABLE `notification_logs`
  ADD COLUMN IF NOT EXISTS `recipient_name`    VARCHAR(200)  NULL AFTER `parish_id`,
  ADD COLUMN IF NOT EXISTS `recipient_phone`   VARCHAR(30)   NULL AFTER `recipient_name`,
  ADD COLUMN IF NOT EXISTS `recipient_email`   VARCHAR(150)  NULL AFTER `recipient_phone`,
  ADD COLUMN IF NOT EXISTS `notification_type` VARCHAR(60)   NULL AFTER `recipient_email`,
  ADD COLUMN IF NOT EXISTS `subject`           VARCHAR(300)  NULL AFTER `body`,
  ADD COLUMN IF NOT EXISTS `related_id`        INT UNSIGNED  NULL,
  ADD COLUMN IF NOT EXISTS `related_type`      VARCHAR(60)   NULL,
  MODIFY COLUMN `channel` ENUM('whatsapp','sms','email','none') NOT NULL DEFAULT 'none',
  MODIFY COLUMN `status`  ENUM('queued','sent','failed','none') NOT NULL DEFAULT 'queued';

-- ─────────────────────────────────────────────
-- BULK NOTIFICATION BROADCASTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notification_broadcasts` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id`   INT UNSIGNED NOT NULL,
  `title`       VARCHAR(200) NOT NULL,
  `message`     TEXT NOT NULL,
  `audience`    ENUM('all','community','role','custom') NOT NULL DEFAULT 'all',
  `audience_id` INT UNSIGNED NULL COMMENT 'community_id or role_id depending on audience',
  `channel`     SET('whatsapp','sms','email') NOT NULL DEFAULT 'sms',
  `total_sent`  INT UNSIGNED NOT NULL DEFAULT 0,
  `total_failed`INT UNSIGNED NOT NULL DEFAULT 0,
  `status`      ENUM('draft','sending','completed','failed') NOT NULL DEFAULT 'draft',
  `sent_by`     INT UNSIGNED NOT NULL,
  `sent_at`     DATETIME NULL,
  `created_at`  DATETIME NOT NULL,
  `updated_at`  DATETIME NOT NULL,
  INDEX `idx_broadcast_parish` (`parish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- MEMBER SELF-REGISTRATION APPLICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `member_applications` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id`        INT UNSIGNED NOT NULL DEFAULT 1,
  `first_name`       VARCHAR(80) NOT NULL,
  `last_name`        VARCHAR(80) NOT NULL,
  `middle_name`      VARCHAR(80) NULL,
  `gender`           ENUM('male','female','other') NOT NULL,
  `date_of_birth`    DATE NULL,
  `phone`            VARCHAR(30) NULL,
  `email`            VARCHAR(150) NULL,
  `community_id`     INT UNSIGNED NULL,
  `address`          TEXT NULL,
  `marriage_status`  ENUM('single','married','widowed','divorced','religious') DEFAULT 'single',
  `occupation`       VARCHAR(100) NULL,
  `notes`            TEXT NULL,
  `status`           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by`      INT UNSIGNED NULL,
  `reviewed_at`      DATETIME NULL,
  `rejection_reason` TEXT NULL,
  `converted_member_id` INT UNSIGNED NULL,
  `created_at`       DATETIME NOT NULL,
  INDEX `idx_app_parish` (`parish_id`),
  INDEX `idx_app_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- AI CONVERSATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ai_conversations` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parish_id`  INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `title`      VARCHAR(200) NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_ai_conv_parish` (`parish_id`),
  INDEX `idx_ai_conv_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_messages` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `conversation_id` INT UNSIGNED NOT NULL,
  `role`            ENUM('user','assistant','system') NOT NULL,
  `content`         TEXT NOT NULL,
  `tokens_used`     INT UNSIGNED NULL,
  `created_at`      DATETIME NOT NULL,
  INDEX `idx_ai_msg_conv` (`conversation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- RECONCILIATION ITEMS (for line-by-line matching)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `reconciliation_items` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `reconciliation_id` INT UNSIGNED NOT NULL,
  `transaction_date`  DATE NOT NULL,
  `description`       VARCHAR(300) NOT NULL,
  `bank_amount`       DECIMAL(15,2) NOT NULL,
  `transaction_id`    INT UNSIGNED NULL COMMENT 'matched system transaction',
  `is_matched`        TINYINT(1) NOT NULL DEFAULT 0,
  `is_reconciled`     TINYINT(1) NOT NULL DEFAULT 0,
  `notes`             TEXT NULL,
  `created_at`        DATETIME NOT NULL,
  INDEX `idx_recon_item_recon` (`reconciliation_id`),
  INDEX `idx_recon_item_tx` (`transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- BUDGET ALERTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `budget_alerts` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `budget_id`   INT UNSIGNED NOT NULL,
  `parish_id`   INT UNSIGNED NOT NULL,
  `threshold`   TINYINT UNSIGNED NOT NULL DEFAULT 80 COMMENT 'Alert at N% of budget',
  `is_sent`     TINYINT(1) NOT NULL DEFAULT 0,
  `sent_at`     DATETIME NULL,
  `created_at`  DATETIME NOT NULL,
  INDEX `idx_budget_alert` (`budget_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
