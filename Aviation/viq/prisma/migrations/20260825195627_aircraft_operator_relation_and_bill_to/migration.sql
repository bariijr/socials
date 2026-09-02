/*
  Warnings:

  - Made the column `current_operator_id` on table `aircraft` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "aircraft" ADD COLUMN     "colors" TEXT,
ADD COLUMN     "operation_type" TEXT,
ALTER COLUMN "current_operator_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "bill_to_address" TEXT;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_current_operator_id_fkey" FOREIGN KEY ("current_operator_id") REFERENCES "operators"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;
