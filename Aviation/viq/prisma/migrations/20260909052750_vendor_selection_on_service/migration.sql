-- AlterTable
ALTER TABLE "services" ADD COLUMN     "vendor_assignment_id" TEXT,
ADD COLUMN     "vendor_selected_at_z" TIMESTAMP(3),
ADD COLUMN     "vendor_selection_source" TEXT;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_vendor_assignment_id_fkey" FOREIGN KEY ("vendor_assignment_id") REFERENCES "vendor_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
