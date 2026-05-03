-- MySQL Schema for Pounds Microfinance
-- Adapted from PostgreSQL to MySQL 8.0+

-- Create users table
CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `firstName` VARCHAR(100) NOT NULL,
  `lastName` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) UNIQUE,
  `role` ENUM('super_admin', 'admin', 'loan_officer', 'user') NOT NULL DEFAULT 'user',
  `status` ENUM('active', 'inactive', 'suspended', 'pending') NOT NULL DEFAULT 'pending',
  `profilePhoto` VARCHAR(500),
  `nationalId` VARCHAR(50),
  `address` TEXT,
  `language` VARCHAR(10) DEFAULT 'en',
  `twoFactorEnabled` BOOLEAN DEFAULT FALSE,
  `twoFactorSecret` VARCHAR(255),
  `lastLoginAt` DATETIME,
  `lastLoginIp` VARCHAR(50),
  `lastLoginDevice` VARCHAR(500),
  `passwordChangedAt` DATETIME,
  `failedLoginAttempts` INT DEFAULT 0,
  `lockedUntil` DATETIME,
  `notificationPreferences` JSON,
  `emailVerifiedAt` DATETIME,
  `emailVerificationToken` VARCHAR(255),
  `passwordResetToken` VARCHAR(255),
  `passwordResetExpiresAt` DATETIME,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` DATETIME,
  INDEX `idx_email` (`email`),
  INDEX `idx_phone` (`phone`),
  INDEX `idx_role` (`role`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create sessions table
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `userId` CHAR(36) NOT NULL,
  `token` VARCHAR(2000) NOT NULL UNIQUE,
  `refreshToken` VARCHAR(2000),
  `ipAddress` VARCHAR(50) NOT NULL,
  `userAgent` TEXT,
  `deviceFingerprint` VARCHAR(255),
  `expiresAt` DATETIME NOT NULL,
  `lastActivityAt` DATETIME,
  `isActive` BOOLEAN DEFAULT TRUE,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_token` (`token`),
  INDEX `idx_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create audit logs table
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `userId` CHAR(36),
  `userEmail` VARCHAR(255),
  `userRole` VARCHAR(50),
  `action` VARCHAR(255) NOT NULL,
  `entity` VARCHAR(100) NOT NULL,
  `entityId` VARCHAR(255),
  `oldData` JSON,
  `newData` JSON,
  `ipAddress` VARCHAR(50),
  `userAgent` TEXT,
  `requestPath` VARCHAR(500),
  `requestMethod` VARCHAR(10),
  `responseStatus` INT,
  `metadata` JSON,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_user` (`userId`),
  INDEX `idx_entity` (`entity`, `entityId`),
  INDEX `idx_action` (`action`),
  INDEX `idx_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create settings table
CREATE TABLE IF NOT EXISTS `settings` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `key` VARCHAR(100) NOT NULL UNIQUE,
  `value` TEXT,
  `type` VARCHAR(50),
  `description` TEXT,
  `isPublic` BOOLEAN DEFAULT FALSE,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create loan packages table
CREATE TABLE IF NOT EXISTS `loan_packages` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT,
  `interestRate` DECIMAL(5,2) NOT NULL,
  `interestFrequency` ENUM('daily','weekly','monthly','yearly') DEFAULT 'monthly',
  `minAmount` DECIMAL(15,2) NOT NULL,
  `maxAmount` DECIMAL(15,2) NOT NULL,
  `minDuration` INT NOT NULL,
  `maxDuration` INT NOT NULL,
  `processingFeePercent` DECIMAL(5,2) DEFAULT 5,
  `penaltyPercent` DECIMAL(5,2) DEFAULT 5,
  `isActive` BOOLEAN DEFAULT TRUE,
  `eligibilityCriteria` JSON,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create loans table
CREATE TABLE IF NOT EXISTS `loans` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `loanNumber` VARCHAR(50) NOT NULL UNIQUE,
  `borrowerId` CHAR(36) NOT NULL,
  `createdById` CHAR(36) NOT NULL,
  `approvedById` CHAR(36),
  `packageId` CHAR(36) NOT NULL,
  `status` ENUM('draft','submitted','approved','disbursed','overdue','closed','rejected') DEFAULT 'draft',
  `principalAmount` DECIMAL(15,2) NOT NULL,
  `interestRate` DECIMAL(5,2) NOT NULL,
  `durationDays` INT NOT NULL,
  `processingFeeAmount` DECIMAL(15,2) DEFAULT 0,
  `disbursedAmount` DECIMAL(15,2) DEFAULT 0,
  `totalRepayable` DECIMAL(15,2) DEFAULT 0,
  `totalRepaid` DECIMAL(15,2) DEFAULT 0,
  `outstandingBalance` DECIMAL(15,2) DEFAULT 0,
  `totalPenalties` DECIMAL(15,2) DEFAULT 0,
  `dueDate` DATE,
  `submittedAt` DATETIME,
  `approvedAt` DATETIME,
  `disbursedAt` DATETIME,
  `closedAt` DATETIME,
  `purpose` TEXT,
  `rejectionReason` TEXT,
  `notes` TEXT,
  `isLocked` BOOLEAN DEFAULT FALSE,
  `lockedById` CHAR(36),
  `lockedAt` DATETIME,
  `lockedUntil` DATETIME,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`borrowerId`) REFERENCES `users`(`id`),
  FOREIGN KEY (`createdById`) REFERENCES `users`(`id`),
  FOREIGN KEY (`approvedById`) REFERENCES `users`(`id`),
  FOREIGN KEY (`packageId`) REFERENCES `loan_packages`(`id`),
  INDEX `idx_borrower` (`borrowerId`),
  INDEX `idx_status` (`status`),
  INDEX `idx_number` (`loanNumber`),
  INDEX `idx_created_by` (`createdById`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create repayments table
CREATE TABLE IF NOT EXISTS `repayments` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `loanId` CHAR(36) NOT NULL,
  `receiptId` CHAR(36),
  `recordedById` CHAR(36),
  `amount` DECIMAL(15,2) NOT NULL,
  `principalPortion` DECIMAL(15,2) DEFAULT 0,
  `interestPortion` DECIMAL(15,2) DEFAULT 0,
  `penaltyPortion` DECIMAL(15,2) DEFAULT 0,
  `balanceAfter` DECIMAL(15,2) DEFAULT 0,
  `status` ENUM('pending','verified','rejected') DEFAULT 'pending',
  `paymentDate` DATE,
  `paymentMethod` VARCHAR(50),
  `notes` TEXT,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`recordedById`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_loan` (`loanId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create penalties table
CREATE TABLE IF NOT EXISTS `penalties` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `loanId` CHAR(36) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `ratePercent` DECIMAL(5,2) NOT NULL,
  `balanceAtTime` DECIMAL(15,2) NOT NULL,
  `weekNumber` INT,
  `notes` TEXT,
  `waived` BOOLEAN DEFAULT FALSE,
  `waivedById` CHAR(36),
  `waivedAt` DATETIME,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE CASCADE,
  INDEX `idx_loan` (`loanId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create KYC forms table
CREATE TABLE IF NOT EXISTS `kyc_forms` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `userId` CHAR(36),
  `status` ENUM('draft','submitted','under_review','approved','rejected') DEFAULT 'draft',
  `currentStep` INT DEFAULT 1,
  `totalSteps` INT DEFAULT 4,
  `fullName` VARCHAR(200),
  `phone` VARCHAR(20),
  `email` VARCHAR(255),
  `dateOfBirth` DATE,
  `gender` VARCHAR(20),
  `idType` VARCHAR(50),
  `idNumber` VARCHAR(50),
  `idIssuedDate` DATE,
  `idExpiryDate` DATE,
  `address` TEXT,
  `city` VARCHAR(100),
  `county` VARCHAR(100),
  `postalCode` VARCHAR(20),
  `occupation` VARCHAR(100),
  `employer` VARCHAR(200),
  `monthlyIncome` DECIMAL(15,2),
  `ocrData` JSON,
  `reviewNotes` TEXT,
  `reviewedById` CHAR(36),
  `reviewedAt` DATETIME,
  `isLead` BOOLEAN DEFAULT FALSE,
  `leadSource` VARCHAR(100),
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`),
  INDEX `idx_user` (`userId`),
  INDEX `idx_status` (`status`),
  INDEX `idx_id_number` (`idNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create KYC documents table
CREATE TABLE IF NOT EXISTS `kyc_documents` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `kycFormId` CHAR(36) NOT NULL,
  `documentType` ENUM('national_id_front','national_id_back','passport','driving_license','utility_bill','bank_statement','selfie','other') NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `filePath` VARCHAR(500) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `fileSize` BIGINT NOT NULL,
  `fileHash` VARCHAR(64),
  `ocrResult` JSON,
  `ocrProcessed` BOOLEAN DEFAULT FALSE,
  `ocrProcessedAt` DATETIME,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`kycFormId`) REFERENCES `kyc_forms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create receipts table
CREATE TABLE IF NOT EXISTS `receipts` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `receiptNumber` VARCHAR(100) NOT NULL UNIQUE,
  `loanId` CHAR(36),
  `submittedById` CHAR(36) NOT NULL,
  `verifiedById` CHAR(36),
  `amount` DECIMAL(15,2) NOT NULL,
  `paymentDate` DATE,
  `payerName` VARCHAR(200),
  `payerPhone` VARCHAR(20),
  `paymentMethod` VARCHAR(50),
  `bankName` VARCHAR(100),
  `status` ENUM('pending','verified','rejected','duplicate') DEFAULT 'pending',
  `fileHash` VARCHAR(64) UNIQUE,
  `fingerprint` VARCHAR(64) UNIQUE,
  `ocrRawData` JSON,
  `ocrConfirmedData` JSON,
  `ocrProcessed` BOOLEAN DEFAULT FALSE,
  `duplicateOfId` CHAR(36),
  `isSimilarFlagged` BOOLEAN DEFAULT FALSE,
  `similarReceiptIds` JSON,
  `rejectionReason` TEXT,
  `verifiedAt` DATETIME,
  `notes` TEXT,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`),
  FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`),
  FOREIGN KEY (`verifiedById`) REFERENCES `users`(`id`),
  INDEX `idx_loan` (`loanId`),
  INDEX `idx_status` (`status`),
  INDEX `idx_number` (`receiptNumber`),
  INDEX `idx_hash` (`fileHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create receipt files table
CREATE TABLE IF NOT EXISTS `receipt_files` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `receiptId` CHAR(36) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `filePath` VARCHAR(500) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `fileSize` BIGINT NOT NULL,
  `fileHash` VARCHAR(64),
  `ocrResult` JSON,
  `isPrimary` BOOLEAN DEFAULT FALSE,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`receiptId`) REFERENCES `receipts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create disbursements table
CREATE TABLE IF NOT EXISTS `disbursements` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `loanId` CHAR(36) NOT NULL,
  `disbursedById` CHAR(36) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `disbursementDate` DATE NOT NULL,
  `paymentMethod` VARCHAR(50),
  `bankName` VARCHAR(100),
  `accountNumber` VARCHAR(50),
  `transactionReference` VARCHAR(100),
  `proofFileName` VARCHAR(255) NOT NULL,
  `proofFilePath` VARCHAR(500) NOT NULL,
  `proofMimeType` VARCHAR(100) NOT NULL,
  `notes` TEXT,
  `isVerified` BOOLEAN DEFAULT FALSE,
  `verifiedById` CHAR(36),
  `verifiedAt` DATETIME,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`),
  FOREIGN KEY (`disbursedById`) REFERENCES `users`(`id`),
  FOREIGN KEY (`verifiedById`) REFERENCES `users`(`id`),
  INDEX `idx_loan` (`loanId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create notifications table
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `userId` CHAR(36) NOT NULL,
  `type` ENUM('loan_submitted','loan_approved','loan_rejected','loan_disbursed','loan_overdue','payment_received','payment_due','kyc_submitted','kyc_approved','kyc_rejected','account_created','password_reset','system_alert') NOT NULL,
  `channel` ENUM('email','sms','whatsapp','push') NOT NULL,
  `status` ENUM('pending','sent','delivered','failed','read') DEFAULT 'pending',
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `entityType` VARCHAR(100),
  `entityId` CHAR(36),
  `metadata` JSON,
  `isRead` BOOLEAN DEFAULT FALSE,
  `readAt` DATETIME,
  `sentAt` DATETIME,
  `deliveredAt` DATETIME,
  `retryCount` INT DEFAULT 0,
  `nextRetryAt` DATETIME,
  `errorMessage` TEXT,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  INDEX `idx_user` (`userId`),
  INDEX `idx_status` (`status`),
  INDEX `idx_unread` (`userId`, `isRead`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create notification logs table
CREATE TABLE IF NOT EXISTS `notification_logs` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `notificationId` CHAR(36) NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `status` VARCHAR(50) NOT NULL,
  `requestPayload` JSON,
  `responsePayload` JSON,
  `errorMessage` TEXT,
  `externalId` VARCHAR(255),
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create backups table
CREATE TABLE IF NOT EXISTS `backups` (
  `id` CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `type` ENUM('manual','scheduled') DEFAULT 'scheduled',
  `status` ENUM('running','success','failed') DEFAULT 'running',
  `fileName` VARCHAR(255),
  `filePath` VARCHAR(500),
  `fileSize` BIGINT,
  `checksum` VARCHAR(64),
  `emailSent` BOOLEAN DEFAULT FALSE,
  `sftpUploaded` BOOLEAN DEFAULT FALSE,
  `errorMessage` TEXT,
  `completedAt` DATETIME,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
