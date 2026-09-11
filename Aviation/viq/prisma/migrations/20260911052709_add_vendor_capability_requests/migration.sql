-- CreateTable
CREATE TABLE "vendor_capability_requests" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "country_iso2" TEXT,
    "icao" TEXT,
    "service_type" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "token_expires_at_z" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contact_name" TEXT,
    "contact_email" TEXT,
    "can_service" BOOLEAN,
    "vendor_notes" TEXT,
    "submitted_at_z" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "reviewed_at_z" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_by" TEXT,
    "created_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_capability_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_capability_requests_token_key" ON "vendor_capability_requests"("token");

-- CreateIndex
CREATE INDEX "vendor_capability_requests_provider_id_service_type_country_idx" ON "vendor_capability_requests"("provider_id", "service_type", "country_iso2", "icao");

-- AddForeignKey
ALTER TABLE "vendor_capability_requests" ADD CONSTRAINT "vendor_capability_requests_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("provider_id") ON DELETE CASCADE ON UPDATE CASCADE;
