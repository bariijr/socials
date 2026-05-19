-- ============================================================
-- Phase 6: Online Payments, 2FA, Web Push, Committees
-- ============================================================

-- Online payments (Azam Pay STK push)
CREATE TABLE IF NOT EXISTS payments (
    id            INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
    parish_id     INT UNSIGNED     NOT NULL,
    member_id     INT UNSIGNED     NULL,
    external_id   VARCHAR(100)     NOT NULL UNIQUE COMMENT 'Our reference sent to Azam Pay',
    provider      ENUM('mpesa','tigopesa','airtelmoney','halopesa','bank') NOT NULL,
    phone         VARCHAR(20)      NOT NULL,
    amount        DECIMAL(15,2)    NOT NULL,
    currency      VARCHAR(5)       DEFAULT 'TZS',
    purpose       ENUM('donation','pledge','event_ticket','other') DEFAULT 'donation',
    reference_id  INT UNSIGNED     NULL COMMENT 'campaign_id, pledge_id, or event_id',
    status        ENUM('pending','completed','failed','cancelled') DEFAULT 'pending',
    gateway_ref   VARCHAR(200)     NULL COMMENT 'Azam Pay transactionId',
    gateway_resp  JSON             NULL,
    created_at    TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payments_parish (parish_id),
    INDEX idx_payments_status (status),
    INDEX idx_payments_ext   (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Web Push subscriptions (browser notification opt-in)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    endpoint   TEXT         NOT NULL,
    p256dh     TEXT         NOT NULL,
    auth       TEXT         NOT NULL,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_push (user_id, endpoint(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TOTP 2FA secrets per user
CREATE TABLE IF NOT EXISTS totp_secrets (
    user_id      INT UNSIGNED NOT NULL PRIMARY KEY,
    secret       VARCHAR(64)  NOT NULL,
    enabled      TINYINT(1)   DEFAULT 0,
    backup_codes JSON         NULL COMMENT 'Array of hashed single-use codes',
    enabled_at   TIMESTAMP    NULL,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Parish committees (pastoral council, choir, finance, etc.)
CREATE TABLE IF NOT EXISTS committees (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT UNSIGNED NOT NULL,
    name            VARCHAR(150) NOT NULL,
    description     TEXT         NULL,
    type            ENUM('pastoral','liturgical','finance','outreach','youth','women','other') DEFAULT 'other',
    chairperson_id  INT UNSIGNED NULL COMMENT 'members.id',
    active          TINYINT(1)   DEFAULT 1,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP    NULL,
    INDEX idx_committees_parish (parish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS committee_members (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    committee_id INT UNSIGNED NOT NULL,
    member_id    INT UNSIGNED NOT NULL,
    role         VARCHAR(100) NULL,
    joined_at    DATE         NULL,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_committee_member (committee_id, member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
