-- AlterTable
ALTER TABLE "services" ADD COLUMN     "authorization_id" TEXT;

-- CreateTable
CREATE TABLE "permit_authorizations" (
    "id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,
    "country_iso2" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "authorization_type" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "doc_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "permit_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permit_authorizations_operator_id_country_iso2_service_type_idx" ON "permit_authorizations"("operator_id", "country_iso2", "service_type", "status");

-- AddForeignKey
ALTER TABLE "permit_authorizations" ADD CONSTRAINT "permit_authorizations_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permit_authorizations" ADD CONSTRAINT "permit_authorizations_country_iso2_fkey" FOREIGN KEY ("country_iso2") REFERENCES "countries"("iso2") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "permit_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
