-- AlterTable
ALTER TABLE "docs" ADD COLUMN     "ocr_error" TEXT,
ADD COLUMN     "ocr_processed_at" TIMESTAMP(3),
ADD COLUMN     "ocr_status" TEXT,
ADD COLUMN     "ocr_structured_fields" JSONB,
ADD COLUMN     "ocr_text" TEXT;
