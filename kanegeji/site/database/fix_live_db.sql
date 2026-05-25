-- ============================================================
-- KANEGEJI PARISH ERP — LIVE DATABASE FIX SCRIPT
-- Run once on the existing (already-migrated) database.
-- Safe to re-run: all changes use IF NOT EXISTS / IGNORE.
-- ============================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ============================================================
-- 1. FIX BUDGETS TABLE
--    Phase-1 schema used: amount (wrong), no name column,
--    period ENUM with quarterly/monthly labels.
--    BudgetController expects: amount_budgeted, name,
--    period ENUM('monthly','quarterly','annual').
-- ============================================================

-- Rename amount → amount_budgeted
ALTER TABLE budgets
  CHANGE COLUMN `amount` `amount_budgeted` DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Add name column (required by BudgetController)
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS `name` VARCHAR(200) NOT NULL DEFAULT ''
  AFTER `fiscal_year`;

-- Normalise period values before changing ENUM
UPDATE budgets SET period = 'annual'    WHERE period IN ('annual','q1','q2','q3','q4');
UPDATE budgets SET period = 'monthly'   WHERE period IN ('january','february','march','april','may','june',
                                                          'july','august','september','october','november','december');
UPDATE budgets SET period = 'quarterly' WHERE period NOT IN ('monthly','quarterly','annual');

-- Shrink period ENUM to what BudgetController uses
ALTER TABLE budgets
  MODIFY COLUMN `period` ENUM('monthly','quarterly','annual') NOT NULL DEFAULT 'annual';

-- ============================================================
-- 2. FIX ADMIN EMAIL
-- ============================================================

UPDATE users
   SET email = 'admin@kanegeji.or.tz'
 WHERE email = 'admin@kanegeji.go.tz'
   AND role_id = 1;

-- ============================================================
-- 2b. FIX ADMIN PASSWORD HASH
--     The original seed used a corrupted bcrypt hash (cost digit
--     was changed from 10→12 manually without recomputing, making
--     the hash invalid — password_verify returns false for ALL inputs).
--     This resets the password to "password" (cost-10 bcrypt).
--     Run database/reset_admin_password.php immediately after to set
--     a strong production password.
-- ============================================================

UPDATE users
   SET password_hash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
 WHERE role_id = 1
   AND deleted_at IS NULL
   AND password_hash = '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

-- ============================================================
-- 3. FIX PARISHES CONTACT EMAIL
-- ============================================================

UPDATE parishes
   SET email = 'info@kanegeji.or.tz'
 WHERE email = 'info@kanegeji.go.tz'
   AND id = 1;

-- ============================================================
-- 4. FIX TRANSACTION CATEGORIES — EXPENSE ACCOUNT IDs
--    Phase-1 schema mapped expenses to account IDs 21-27,
--    but the chart_of_accounts expense rows start at ID 22.
--    (ID 21 = Shop Income — an income account.)
-- ============================================================

UPDATE transaction_categories SET account_id = 22 WHERE name = 'Umeme'      AND parish_id = 1 AND type = 'expense';
UPDATE transaction_categories SET account_id = 23 WHERE name = 'Maji'       AND parish_id = 1 AND type = 'expense';
UPDATE transaction_categories SET account_id = 24 WHERE name = 'Mishahara'  AND parish_id = 1 AND type = 'expense';
UPDATE transaction_categories SET account_id = 25 WHERE name = 'Matengenezo' AND parish_id = 1 AND type = 'expense';
UPDATE transaction_categories SET account_id = 27 WHERE name = 'Usafiri'    AND parish_id = 1 AND type = 'expense';
UPDATE transaction_categories SET account_id = 28 WHERE name = 'Ofisi'      AND parish_id = 1 AND type = 'expense';
UPDATE transaction_categories SET account_id = 29 WHERE name = 'Hisani'     AND parish_id = 1 AND type = 'expense';

-- ============================================================
-- 5. FIX MEMBER_APPLICATIONS — ADD community_name COLUMN
--    AuthController::storeApplication inserts a text value
--    into community_name, but the phase-3 schema only had
--    community_id (INT).  Add the missing text column.
-- ============================================================

ALTER TABLE member_applications
  ADD COLUMN IF NOT EXISTS `community_name` VARCHAR(150) NULL
  AFTER `community_id`;

-- ============================================================
-- 6. ENSURE notification_logs HAS ALL PHASE-3 COLUMNS
--    (safe no-op if migration 003 already ran)
-- ============================================================

ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS `recipient_name`    VARCHAR(200) NULL AFTER `parish_id`,
  ADD COLUMN IF NOT EXISTS `recipient_phone`   VARCHAR(30)  NULL AFTER `recipient_name`,
  ADD COLUMN IF NOT EXISTS `recipient_email`   VARCHAR(150) NULL AFTER `recipient_phone`,
  ADD COLUMN IF NOT EXISTS `notification_type` VARCHAR(60)  NULL AFTER `recipient_email`,
  ADD COLUMN IF NOT EXISTS `related_id`        INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS `related_type`      VARCHAR(60)  NULL;

SET foreign_key_checks = 1;

-- ============================================================
-- VERIFICATION QUERIES (run manually to confirm)
-- ============================================================
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budgets'
--   ORDER BY ORDINAL_POSITION;
-- SELECT email FROM users WHERE role_id = 1;
-- SELECT name, account_id FROM transaction_categories WHERE type='expense';
