import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000001 implements MigrationInterface {
  name = 'InitialSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Users table
    await queryRunner.query(`
      CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'loan_officer', 'user');
      CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending');
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        "firstName" VARCHAR(100) NOT NULL,
        "lastName" VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE,
        role user_role NOT NULL DEFAULT 'user',
        status user_status NOT NULL DEFAULT 'pending',
        "profilePhoto" VARCHAR(500),
        "nationalId" VARCHAR(50),
        address TEXT,
        language VARCHAR(10) DEFAULT 'en',
        "twoFactorEnabled" BOOLEAN DEFAULT false,
        "twoFactorSecret" VARCHAR(255),
        "lastLoginAt" TIMESTAMPTZ,
        "lastLoginIp" VARCHAR(50),
        "lastLoginDevice" VARCHAR(500),
        "passwordChangedAt" TIMESTAMPTZ,
        "failedLoginAttempts" INT DEFAULT 0,
        "lockedUntil" TIMESTAMPTZ,
        "notificationPreferences" JSONB,
        "emailVerifiedAt" TIMESTAMPTZ,
        "emailVerificationToken" VARCHAR(255),
        "passwordResetToken" VARCHAR(255),
        "passwordResetExpiresAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        "deletedAt" TIMESTAMPTZ
      );
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_phone ON users(phone);
      CREATE INDEX idx_users_role ON users(role);
      CREATE INDEX idx_users_status ON users(status);
    `);

    // Sessions
    await queryRunner.query(`
      CREATE TABLE sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(2000) UNIQUE NOT NULL,
        "refreshToken" VARCHAR(2000),
        "ipAddress" VARCHAR(50) NOT NULL,
        "userAgent" TEXT,
        "deviceFingerprint" VARCHAR(255),
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "lastActivityAt" TIMESTAMPTZ,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_sessions_token ON sessions(token);
      CREATE INDEX idx_sessions_user ON sessions("userId");
    `);

    // Audit Logs (immutable)
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID,
        "userEmail" VARCHAR(255),
        "userRole" VARCHAR(50),
        action VARCHAR(255) NOT NULL,
        entity VARCHAR(100) NOT NULL,
        "entityId" VARCHAR(255),
        "oldData" JSONB,
        "newData" JSONB,
        "ipAddress" VARCHAR(50),
        "userAgent" TEXT,
        "requestPath" VARCHAR(500),
        "requestMethod" VARCHAR(10),
        "responseStatus" INT,
        metadata JSONB,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_audit_user ON audit_logs("userId");
      CREATE INDEX idx_audit_entity ON audit_logs(entity, "entityId");
      CREATE INDEX idx_audit_action ON audit_logs(action);
      CREATE INDEX idx_audit_created ON audit_logs("createdAt");
    `);

    // Settings
    await queryRunner.query(`
      CREATE TABLE settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        type VARCHAR(50),
        description TEXT,
        "isPublic" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // KYC Forms
    await queryRunner.query(`
      CREATE TYPE kyc_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected');
      CREATE TABLE kyc_forms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID REFERENCES users(id),
        status kyc_status DEFAULT 'draft',
        "currentStep" INT DEFAULT 1,
        "totalSteps" INT DEFAULT 4,
        "fullName" VARCHAR(200),
        phone VARCHAR(20),
        email VARCHAR(255),
        "dateOfBirth" DATE,
        gender VARCHAR(20),
        "idType" VARCHAR(50),
        "idNumber" VARCHAR(50),
        "idIssuedDate" DATE,
        "idExpiryDate" DATE,
        address TEXT,
        city VARCHAR(100),
        county VARCHAR(100),
        "postalCode" VARCHAR(20),
        occupation VARCHAR(100),
        employer VARCHAR(200),
        "monthlyIncome" DECIMAL(15,2),
        "ocrData" JSONB,
        "reviewNotes" TEXT,
        "reviewedById" UUID REFERENCES users(id),
        "reviewedAt" TIMESTAMPTZ,
        "isLead" BOOLEAN DEFAULT false,
        "leadSource" VARCHAR(100),
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_kyc_user ON kyc_forms("userId");
      CREATE INDEX idx_kyc_status ON kyc_forms(status);
      CREATE INDEX idx_kyc_id_number ON kyc_forms("idNumber");
    `);

    // KYC Documents
    await queryRunner.query(`
      CREATE TYPE document_type AS ENUM (
        'national_id_front','national_id_back','passport','driving_license',
        'utility_bill','bank_statement','selfie','other'
      );
      CREATE TABLE kyc_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "kycFormId" UUID NOT NULL REFERENCES kyc_forms(id) ON DELETE CASCADE,
        "documentType" document_type NOT NULL,
        "fileName" VARCHAR(255) NOT NULL,
        "filePath" VARCHAR(500) NOT NULL,
        "mimeType" VARCHAR(100) NOT NULL,
        "fileSize" BIGINT NOT NULL,
        "fileHash" VARCHAR(64),
        "ocrResult" JSONB,
        "ocrProcessed" BOOLEAN DEFAULT false,
        "ocrProcessedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Loan Packages
    await queryRunner.query(`
      CREATE TYPE interest_frequency AS ENUM ('daily','weekly','monthly','yearly');
      CREATE TABLE loan_packages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        "interestRate" DECIMAL(5,2) NOT NULL,
        "interestFrequency" interest_frequency DEFAULT 'monthly',
        "minAmount" DECIMAL(15,2) NOT NULL,
        "maxAmount" DECIMAL(15,2) NOT NULL,
        "minDuration" INT NOT NULL,
        "maxDuration" INT NOT NULL,
        "processingFeePercent" DECIMAL(5,2) DEFAULT 5,
        "penaltyPercent" DECIMAL(5,2) DEFAULT 5,
        "isActive" BOOLEAN DEFAULT true,
        "eligibilityCriteria" JSONB,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Loans
    await queryRunner.query(`
      CREATE TYPE loan_status AS ENUM ('draft','submitted','approved','disbursed','overdue','closed','rejected');
      CREATE TABLE loans (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "loanNumber" VARCHAR(50) UNIQUE NOT NULL,
        "borrowerId" UUID NOT NULL REFERENCES users(id),
        "createdById" UUID NOT NULL REFERENCES users(id),
        "approvedById" UUID REFERENCES users(id),
        "packageId" UUID NOT NULL REFERENCES loan_packages(id),
        status loan_status DEFAULT 'draft',
        "principalAmount" DECIMAL(15,2) NOT NULL,
        "interestRate" DECIMAL(5,2) NOT NULL,
        "durationDays" INT NOT NULL,
        "processingFeeAmount" DECIMAL(15,2) DEFAULT 0,
        "disbursedAmount" DECIMAL(15,2) DEFAULT 0,
        "totalRepayable" DECIMAL(15,2) DEFAULT 0,
        "totalRepaid" DECIMAL(15,2) DEFAULT 0,
        "outstandingBalance" DECIMAL(15,2) DEFAULT 0,
        "totalPenalties" DECIMAL(15,2) DEFAULT 0,
        "dueDate" DATE,
        "submittedAt" TIMESTAMPTZ,
        "approvedAt" TIMESTAMPTZ,
        "disbursedAt" TIMESTAMPTZ,
        "closedAt" TIMESTAMPTZ,
        purpose TEXT,
        "rejectionReason" TEXT,
        notes TEXT,
        "isLocked" BOOLEAN DEFAULT false,
        "lockedById" UUID,
        "lockedAt" TIMESTAMPTZ,
        "lockedUntil" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT approver_not_creator CHECK ("createdById" != "approvedById")
      );
      CREATE INDEX idx_loans_borrower ON loans("borrowerId");
      CREATE INDEX idx_loans_status ON loans(status);
      CREATE INDEX idx_loans_number ON loans("loanNumber");
      CREATE INDEX idx_loans_created_by ON loans("createdById");
    `);

    // Repayments
    await queryRunner.query(`
      CREATE TYPE repayment_status AS ENUM ('pending','verified','rejected');
      CREATE TABLE repayments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "loanId" UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        "receiptId" UUID,
        "recordedById" UUID REFERENCES users(id),
        amount DECIMAL(15,2) NOT NULL,
        "principalPortion" DECIMAL(15,2) DEFAULT 0,
        "interestPortion" DECIMAL(15,2) DEFAULT 0,
        "penaltyPortion" DECIMAL(15,2) DEFAULT 0,
        "balanceAfter" DECIMAL(15,2) DEFAULT 0,
        status repayment_status DEFAULT 'pending',
        "paymentDate" DATE,
        "paymentMethod" VARCHAR(50),
        notes TEXT,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_repayments_loan ON repayments("loanId");
    `);

    // Penalties
    await queryRunner.query(`
      CREATE TABLE penalties (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "loanId" UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        amount DECIMAL(15,2) NOT NULL,
        "ratePercent" DECIMAL(5,2) NOT NULL,
        "balanceAtTime" DECIMAL(15,2) NOT NULL,
        "weekNumber" INT,
        notes TEXT,
        waived BOOLEAN DEFAULT false,
        "waivedById" UUID,
        "waivedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_penalties_loan ON penalties("loanId");
    `);

    // Receipts
    await queryRunner.query(`
      CREATE TYPE receipt_status AS ENUM ('pending','verified','rejected','duplicate');
      CREATE TABLE receipts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "receiptNumber" VARCHAR(100) UNIQUE NOT NULL,
        "loanId" UUID REFERENCES loans(id),
        "submittedById" UUID NOT NULL REFERENCES users(id),
        "verifiedById" UUID REFERENCES users(id),
        amount DECIMAL(15,2) NOT NULL,
        "paymentDate" DATE,
        "payerName" VARCHAR(200),
        "payerPhone" VARCHAR(20),
        "paymentMethod" VARCHAR(50),
        "bankName" VARCHAR(100),
        status receipt_status DEFAULT 'pending',
        "fileHash" VARCHAR(64) UNIQUE,
        fingerprint VARCHAR(64) UNIQUE,
        "ocrRawData" JSONB,
        "ocrConfirmedData" JSONB,
        "ocrProcessed" BOOLEAN DEFAULT false,
        "duplicateOfId" UUID,
        "isSimilarFlagged" BOOLEAN DEFAULT false,
        "similarReceiptIds" JSONB,
        "rejectionReason" TEXT,
        "verifiedAt" TIMESTAMPTZ,
        notes TEXT,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_receipts_loan ON receipts("loanId");
      CREATE INDEX idx_receipts_status ON receipts(status);
      CREATE INDEX idx_receipts_number ON receipts("receiptNumber");
      CREATE INDEX idx_receipts_hash ON receipts("fileHash");
    `);

    // Receipt Files
    await queryRunner.query(`
      CREATE TABLE receipt_files (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "receiptId" UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        "fileName" VARCHAR(255) NOT NULL,
        "filePath" VARCHAR(500) NOT NULL,
        "mimeType" VARCHAR(100) NOT NULL,
        "fileSize" BIGINT NOT NULL,
        "fileHash" VARCHAR(64),
        "ocrResult" JSONB,
        "isPrimary" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Disbursements
    await queryRunner.query(`
      CREATE TABLE disbursements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "loanId" UUID NOT NULL REFERENCES loans(id),
        "disbursedById" UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(15,2) NOT NULL,
        "disbursementDate" DATE NOT NULL,
        "paymentMethod" VARCHAR(50),
        "bankName" VARCHAR(100),
        "accountNumber" VARCHAR(50),
        "transactionReference" VARCHAR(100),
        "proofFileName" VARCHAR(255) NOT NULL,
        "proofFilePath" VARCHAR(500) NOT NULL,
        "proofMimeType" VARCHAR(100) NOT NULL,
        notes TEXT,
        "isVerified" BOOLEAN DEFAULT false,
        "verifiedById" UUID,
        "verifiedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_disbursements_loan ON disbursements("loanId");
    `);

    // Notifications
    await queryRunner.query(`
      CREATE TYPE notification_channel AS ENUM ('email','sms','whatsapp','push');
      CREATE TYPE notification_status AS ENUM ('pending','sent','delivered','failed','read');
      CREATE TYPE notification_type AS ENUM (
        'loan_submitted','loan_approved','loan_rejected','loan_disbursed','loan_overdue',
        'payment_received','payment_due','kyc_submitted','kyc_approved','kyc_rejected',
        'account_created','password_reset','system_alert'
      );
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES users(id),
        type notification_type NOT NULL,
        channel notification_channel NOT NULL,
        status notification_status DEFAULT 'pending',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        "entityType" VARCHAR(100),
        "entityId" UUID,
        metadata JSONB,
        "isRead" BOOLEAN DEFAULT false,
        "readAt" TIMESTAMPTZ,
        "sentAt" TIMESTAMPTZ,
        "deliveredAt" TIMESTAMPTZ,
        "retryCount" INT DEFAULT 0,
        "nextRetryAt" TIMESTAMPTZ,
        "errorMessage" TEXT,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_notifications_user ON notifications("userId");
      CREATE INDEX idx_notifications_status ON notifications(status);
      CREATE INDEX idx_notifications_unread ON notifications("userId", "isRead");
    `);

    // Notification Logs
    await queryRunner.query(`
      CREATE TABLE notification_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "notificationId" UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        "requestPayload" JSONB,
        "responsePayload" JSONB,
        "errorMessage" TEXT,
        "externalId" VARCHAR(255),
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Backups
    await queryRunner.query(`
      CREATE TYPE backup_status AS ENUM ('running','success','failed');
      CREATE TYPE backup_type AS ENUM ('manual','scheduled');
      CREATE TABLE backups (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type backup_type DEFAULT 'scheduled',
        status backup_status DEFAULT 'running',
        "fileName" VARCHAR(255),
        "filePath" VARCHAR(500),
        "fileSize" BIGINT,
        checksum VARCHAR(64),
        "emailSent" BOOLEAN DEFAULT false,
        "sftpUploaded" BOOLEAN DEFAULT false,
        "errorMessage" TEXT,
        "completedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS backups CASCADE;
      DROP TABLE IF EXISTS notification_logs CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS disbursements CASCADE;
      DROP TABLE IF EXISTS receipt_files CASCADE;
      DROP TABLE IF EXISTS receipts CASCADE;
      DROP TABLE IF EXISTS penalties CASCADE;
      DROP TABLE IF EXISTS repayments CASCADE;
      DROP TABLE IF EXISTS loans CASCADE;
      DROP TABLE IF EXISTS loan_packages CASCADE;
      DROP TABLE IF EXISTS kyc_documents CASCADE;
      DROP TABLE IF EXISTS kyc_forms CASCADE;
      DROP TABLE IF EXISTS settings CASCADE;
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TYPE IF EXISTS backup_status, backup_type, notification_type,
        notification_status, notification_channel, receipt_status,
        repayment_status, loan_status, interest_frequency, document_type,
        kyc_status, user_status, user_role CASCADE;
    `);
  }
}
