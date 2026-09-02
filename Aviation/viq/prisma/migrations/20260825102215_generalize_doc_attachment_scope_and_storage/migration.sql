/*
  Warnings:

  - Added the required column `file_path` to the `docs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `file_size_bytes` to the `docs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mime_type` to the `docs` table without a default value. This is not possible if the table is not empty.

*/
-- The 4 existing rows are synthetic demo-seed metadata with no real file
-- ever stored behind them (this migration introduces real file storage for
-- the first time) — clear them rather than backfill fake file_path values
-- that would point at nonexistent files.
DELETE FROM "docs";

-- AlterTable
ALTER TABLE "docs" ADD COLUMN     "aircraft_registration" TEXT,
ADD COLUMN     "file_path" TEXT NOT NULL,
ADD COLUMN     "file_size_bytes" INTEGER NOT NULL,
ADD COLUMN     "mime_type" TEXT NOT NULL,
ADD COLUMN     "person_id" TEXT,
ALTER COLUMN "trip_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "docs_person_id_idx" ON "docs"("person_id");

-- CreateIndex
CREATE INDEX "docs_aircraft_registration_idx" ON "docs"("aircraft_registration");

-- AddForeignKey
ALTER TABLE "docs" ADD CONSTRAINT "docs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
