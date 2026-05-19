-- ============================================================
-- Migration 006 — Bank Reconciliation Items table
-- Run after: 005-phase6-schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `reconciliation_items` (
    `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `parish_id`       INT UNSIGNED NOT NULL DEFAULT 1,
    `statement_date`  DATE NOT NULL,
    `description`     VARCHAR(500) NOT NULL DEFAULT '',
    `amount`          DECIMAL(15,2) NOT NULL,
    `type`            ENUM('credit','debit') NOT NULL,
    `status`          ENUM('unmatched','matched','reconciled') NOT NULL DEFAULT 'unmatched',
    `transaction_id`  INT UNSIGNED NULL,
    `reconciled_by`   INT UNSIGNED NULL,
    `reconciled_at`   DATETIME NULL,
    `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_ri_parish_month` (`parish_id`, `statement_date`),
    INDEX `idx_ri_status`       (`parish_id`, `status`),
    INDEX `idx_ri_tx`           (`transaction_id`),
    CONSTRAINT `fk_ri_tx`   FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_ri_user` FOREIGN KEY (`reconciled_by`)  REFERENCES `users`(`id`)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
