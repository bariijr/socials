-- =====================================================================
-- PHASE 4 MIGRATION — AI Knowledge, Budget, Announcements,
--                      Mass Schedules, Online Giving, Catholic Content
-- Run: mysql -u user -p kanegeji_db < 004-phase4-schema.sql
-- =====================================================================

-- ── BUDGETS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    parish_id       INT NOT NULL,
    fiscal_year     YEAR NOT NULL DEFAULT (YEAR(CURDATE())),
    name            VARCHAR(200) NOT NULL,
    category_id     INT NULL,
    period          ENUM('monthly','quarterly','annual') NOT NULL DEFAULT 'annual',
    amount_budgeted DECIMAL(15,2) NOT NULL DEFAULT 0,
    notes           TEXT NULL,
    created_by      INT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id)   REFERENCES parishes(id),
    FOREIGN KEY (category_id) REFERENCES transaction_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)  REFERENCES users(id),
    INDEX idx_budgets_parish_year (parish_id, fiscal_year)
);

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    parish_id    INT NOT NULL,
    title        VARCHAR(255) NOT NULL,
    content      TEXT NOT NULL,
    type         ENUM('general','liturgical','event','urgent') NOT NULL DEFAULT 'general',
    published_at DATETIME NULL,
    expires_at   DATETIME NULL,
    active       TINYINT(1) NOT NULL DEFAULT 1,
    published_by INT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id)    REFERENCES parishes(id),
    FOREIGN KEY (published_by) REFERENCES users(id),
    INDEX idx_announcements_parish (parish_id, active, published_at)
);

-- ── MASS SCHEDULES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mass_schedules (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    parish_id    INT NOT NULL,
    day_of_week  TINYINT NOT NULL COMMENT '0=Sun 1=Mon … 6=Sat',
    mass_time    TIME NOT NULL,
    location     VARCHAR(150) NULL,
    language     ENUM('sw','en','latin','other') NOT NULL DEFAULT 'sw',
    is_special   TINYINT(1) NOT NULL DEFAULT 0,
    special_note VARCHAR(255) NULL,
    active       TINYINT(1) NOT NULL DEFAULT 1,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id) REFERENCES parishes(id),
    INDEX idx_mass_parish (parish_id, day_of_week, active)
);

-- Seed sample schedules for parish 1
INSERT IGNORE INTO mass_schedules (parish_id, day_of_week, mass_time, location, language, sort_order) VALUES
(1, 0, '07:00:00', 'Kanisa Kuu', 'sw', 1),
(1, 0, '09:00:00', 'Kanisa Kuu', 'sw', 2),
(1, 0, '11:00:00', 'Kanisa Kuu', 'en', 3),
(1, 3, '06:30:00', 'Kanisa Kuu', 'sw', 4),
(1, 5, '06:30:00', 'Kanisa Kuu', 'sw', 5);

-- ── ONLINE DONATIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS online_donations (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    parish_id        INT NOT NULL,
    campaign_id      INT NULL,
    donor_name       VARCHAR(150) NULL,
    donor_phone      VARCHAR(30) NULL,
    donor_email      VARCHAR(150) NULL,
    amount           DECIMAL(15,2) NOT NULL,
    currency         VARCHAR(10) NOT NULL DEFAULT 'TZS',
    payment_method   VARCHAR(50) NULL COMMENT 'mpesa,tigopesa,airtel,bank',
    reference_number VARCHAR(100) NULL,
    proof_file       VARCHAR(255) NULL,
    status           ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    notes            TEXT NULL,
    verified_by      INT NULL,
    verified_at      DATETIME NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id)  REFERENCES parishes(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
    INDEX idx_donations_parish (parish_id, status, created_at)
);

-- ── AI KNOWLEDGE BASE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_knowledge (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT NOT NULL,
    title       VARCHAR(255) NOT NULL,
    content     MEDIUMTEXT NOT NULL,
    type        ENUM('document','faq','procedure','policy','other') NOT NULL DEFAULT 'document',
    source_file VARCHAR(255) NULL,
    word_count  INT NOT NULL DEFAULT 0,
    tags        VARCHAR(500) NULL,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_by  INT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id)  REFERENCES parishes(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FULLTEXT KEY ft_knowledge_search (title, content),
    INDEX idx_knowledge_parish (parish_id, active)
);

-- ── CATHOLIC CONTENT (static) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catholic_content (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    parish_id  INT NULL COMMENT 'NULL = global content',
    type       ENUM('prayer','reading','devotion','novena','catechism','saint') NOT NULL,
    title      VARCHAR(255) NOT NULL,
    content    MEDIUMTEXT NOT NULL,
    language   ENUM('sw','en') NOT NULL DEFAULT 'sw',
    feast_date DATE NULL COMMENT 'For saints/feasts',
    active     TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_catholic_type (type, language, active)
);

-- Seed core Swahili prayers
INSERT IGNORE INTO catholic_content (parish_id, type, title, content, language, sort_order) VALUES
(NULL, 'prayer', 'Sala ya Bwana (Baba Yetu)', 'Baba yetu uliye mbinguni,\nJina lako litukuzwe.\nUfalme wako uje,\nMatakwa yako yatimizwe,\nHapa duniani kama mbinguni.\nUtupe leo mkate wetu wa kila siku.\nUtusamehe makosa yetu,\nKama sisi nasi tunavyowasamehe waliotukosea.\nUsitutie majaribuni,\nLakini utuokoe na yule mwovu.\n[Kwa maana ufalme ni wako,\nNa nguvu na utukufu milele na milele. Amina.]', 'sw', 1),
(NULL, 'prayer', 'Salamu Maria (Ave Maria)', 'Salamu Maria, umejaa neema,\nBwana yu nawe.\nUmebarikiwa wewe miongoni mwa wanawake,\nNa amebarikiwa tunda la tumbo lako, Yesu.\nMaria Mtakatifu, Mama wa Mungu,\nTuombee sisi wenye dhambi,\nSasa na wakati wa mauti yetu. Amina.', 'sw', 2),
(NULL, 'prayer', 'Imani ya Kitume (Nicene Creed)', 'Naamini katika Mungu mmoja,\nBaba Mwenyezi,\nMuumba wa mbingu na ardhi,\nNa vitu vyote vinavyoonekana na visivyoonekana.\nNaamini katika Bwana mmoja Yesu Kristo,\nMwana wa pekee wa Mungu,\nAliyezaliwa kutoka kwa Baba kabla ya nyakati zote:\nMungu kutoka kwa Mungu, Nuru kutoka kwa Nuru,\nMungu wa kweli kutoka kwa Mungu wa kweli;\nAliyezaliwa, si kuumbwa, wa asili moja na Baba.\nNi kwa ajili yake vitu vyote viliumbwa.\nKwa ajili yetu wanadamu na kwa wokovu wetu,\nAlishuka toka mbinguni:\nKwa nguvu za Roho Mtakatifu\nAlitwaa mwili kwa Bikira Maria,\nNa akawa mtu.\nKwa ajili yetu alisulubishwa chini ya Pontio Pilato,\nAliteseka, akafariki na kuzikwa.\nSiku ya tatu alifufuka kutoka wafu\nKama Maandiko yanavyosema.\nAkakaa juu mbinguni,\nAmeketi mkono wa kuume wa Baba.\nAtakuja tena kwa utukufu\nKuhukumu walio hai na waliokufa;\nNa ufalme wake hautakuwa na mwisho.\nNaamini katika Roho Mtakatifu,\nBwana na Mtoaji wa uhai,\nAtokaaye kwa Baba na Mwana,\nAnayeabudiwa na kutukuzwa\nPamoja na Baba na Mwana.\nAliongea kwa njia ya manabii.\nNaamini katika Kanisa moja, takatifu,\nKatoliki na la mitume.\nNakiri ubatizo mmoja kwa msamaha wa dhambi.\nNatarajia ufufuo wa wafu,\nNa uzima wa ulimwengu ujao. Amina.', 'sw', 3),
(NULL, 'prayer', 'Sala ya Malaika wa Bwana (Angelus)', 'V: Malaika wa Bwana alimletelea Maria habari;\nR: Naye akapokea kwa nguvu za Roho Mtakatifu.\nSalamu Maria...\n\nV: Tazama mjakazi wa Bwana;\nR: Iwe kwangu kama ulivyosema.\nSalamu Maria...\n\nV: Na Neno alifanyika mwili;\nR: Akakaa kati yetu.\nSalamu Maria...\n\nV: Tuombee, Mama Mtakatifu wa Mungu;\nR: Ili tustahili ahadi za Kristo.\n\nTuombeeni: Ee Bwana, kwa habari ya malaika\ntulipata kujua mwili wa Kristo, Mwana wako;\ntupate kulipuka kwake msalabani na kufufuliwa\nhadi kwenye utukufu wa mbinguni.\nTunakuomba kwa njia ya Kristo Bwana wetu. Amina.', 'sw', 4),
(NULL, 'prayer', 'Sala ya Rosario — Nia ya Kwanza (Furaha)', 'MAFUMBO YA FURAHA:\n1. Malaika akampa Maria habari njema.\n2. Maria alimtembelea Elizabeth.\n3. Yesu alizaliwa Bethlehemu.\n4. Yesu aliwasilishwa Hekaluni.\n5. Yesu alipatikana Hekaluni.\n\n(Sala kwa kila fumbo: Baba Yetu 1, Salamu Maria 10, Utukufu 1)', 'sw', 5);

-- ── BUDGET ALERTS (already referenced in 003) ─────────────────────────
CREATE TABLE IF NOT EXISTS budget_alerts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    parish_id   INT NOT NULL,
    budget_id   INT NOT NULL,
    threshold   INT NOT NULL DEFAULT 80 COMMENT 'Percentage used to trigger alert',
    alerted_at  DATETIME NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parish_id) REFERENCES parishes(id),
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
);
