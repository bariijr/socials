-- DropForeignKey
ALTER TABLE "vendor_assignments" DROP CONSTRAINT "vendor_assignments_country_iso2_fkey";

-- AddForeignKey
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_country_iso2_fkey" FOREIGN KEY ("country_iso2") REFERENCES "countries"("iso2") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_icao_fkey" FOREIGN KEY ("icao") REFERENCES "airports"("icao") ON DELETE CASCADE ON UPDATE CASCADE;
