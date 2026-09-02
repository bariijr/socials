-- AlterTable
ALTER TABLE "docs" ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by" TEXT,
ADD COLUMN     "verified_fields" JSONB;
