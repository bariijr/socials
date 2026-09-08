-- CreateTable
CREATE TABLE "vendor_assignments" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "country_iso2" TEXT,
    "icao" TEXT,
    "service_type" TEXT NOT NULL,
    "permit_type" TEXT,
    "client_id" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "prohibited" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_until" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT,
    "created_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_assignments_country_iso2_icao_service_type_permit_ty_idx" ON "vendor_assignments"("country_iso2", "icao", "service_type", "permit_type", "client_id");

-- CreateIndex
CREATE INDEX "vendor_assignments_provider_id_idx" ON "vendor_assignments"("provider_id");

-- AddForeignKey
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("provider_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_country_iso2_fkey" FOREIGN KEY ("country_iso2") REFERENCES "countries"("iso2") ON DELETE SET NULL ON UPDATE CASCADE;
