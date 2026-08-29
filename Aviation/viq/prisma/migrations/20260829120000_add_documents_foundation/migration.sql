-- CreateTable
CREATE TABLE "document_families" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_families_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "document_type_definitions" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family_code" TEXT NOT NULL,
    "description" TEXT,
    "extraction_schema" JSONB,
    "expiry_required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_type_definitions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "documents" (
    "document_id" TEXT NOT NULL,
    "family_code" TEXT,
    "type_code" TEXT,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "detected_mime_type" TEXT,
    "file_size_bytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "uploaded_by" TEXT NOT NULL,
    "uploaded_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_doc_attachment_id" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "storage_path" TEXT NOT NULL,
    "ocr_text" TEXT,
    "ocr_structured_fields" JSONB,
    "verified_fields" JSONB,
    "verified_by" TEXT,
    "verified_at_z" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "supersedes_version_id" INTEGER,
    "created_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sections" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "type_code" TEXT,
    "start_page" INTEGER NOT NULL,
    "end_page" INTEGER NOT NULL,
    "extracted_fields" JSONB,
    "verified_fields" JSONB,

    CONSTRAINT "document_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_entity_links" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "relationship_type" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_processing_jobs" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "queue_job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at_z" TIMESTAMP(3),

    CONSTRAINT "document_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_source_doc_attachment_id_key" ON "documents"("source_doc_attachment_id");
CREATE INDEX "documents_sha256_idx" ON "documents"("sha256");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_family_code_idx" ON "documents"("family_code");
CREATE INDEX "documents_type_code_idx" ON "documents"("type_code");
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");
CREATE INDEX "document_sections_version_id_idx" ON "document_sections"("version_id");
CREATE INDEX "document_entity_links_document_id_idx" ON "document_entity_links"("document_id");
CREATE INDEX "document_entity_links_entity_type_entity_id_idx" ON "document_entity_links"("entity_type", "entity_id");
CREATE INDEX "document_type_definitions_family_code_idx" ON "document_type_definitions"("family_code");
CREATE INDEX "document_processing_jobs_document_id_idx" ON "document_processing_jobs"("document_id");
CREATE INDEX "document_processing_jobs_status_idx" ON "document_processing_jobs"("status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_family_code_fkey" FOREIGN KEY ("family_code") REFERENCES "document_families"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "document_type_definitions"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_type_definitions" ADD CONSTRAINT "document_type_definitions_family_code_fkey" FOREIGN KEY ("family_code") REFERENCES "document_families"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_entity_links" ADD CONSTRAINT "document_entity_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_processing_jobs" ADD CONSTRAINT "document_processing_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: document families (the 7 first-release families + a generic fallback)
INSERT INTO "document_families" ("code", "label", "sort_order") VALUES
  ('PERSON_IDENTITY', 'Person Identity', 0),
  ('CREW_MEDICAL', 'Crew Medical', 1),
  ('CREW_LICENCE', 'Crew Licence & Rating', 2),
  ('AIRCRAFT_REGISTRATION', 'Aircraft Registration', 3),
  ('AIRCRAFT_AIRWORTHINESS', 'Aircraft Airworthiness', 4),
  ('INSURANCE', 'Insurance', 5),
  ('OPERATOR_AUTHORIZATION', 'Operator Authorization', 6),
  ('OTHER', 'Other', 7);

-- Seed: document type definitions (7 first-release types + OTHER fallback)
INSERT INTO "document_type_definitions" ("code", "label", "family_code", "expiry_required", "sort_order") VALUES
  ('PASSPORT', 'Passport', 'PERSON_IDENTITY', true, 0),
  ('CREW_MEDICAL_CERTIFICATE', 'Crew Medical Certificate', 'CREW_MEDICAL', true, 1),
  ('CREW_LICENCE_RATING', 'Crew Licence / Rating', 'CREW_LICENCE', true, 2),
  ('REGISTRATION_CERTIFICATE', 'Registration Certificate', 'AIRCRAFT_REGISTRATION', false, 3),
  ('AIRWORTHINESS_CERTIFICATE', 'Airworthiness Certificate', 'AIRCRAFT_AIRWORTHINESS', true, 4),
  ('INSURANCE_CERTIFICATE', 'Insurance Certificate', 'INSURANCE', true, 5),
  ('AOC_OPS_SPECS', 'AOC / Operations Specifications', 'OPERATOR_AUTHORIZATION', true, 6),
  ('OTHER', 'Other', 'OTHER', false, 7);
