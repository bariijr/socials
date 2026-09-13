-- AlterTable
ALTER TABLE "legs" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Planned',
ADD COLUMN "status_changed_at" TIMESTAMP(3),
ADD COLUMN "status_changed_by" TEXT;
