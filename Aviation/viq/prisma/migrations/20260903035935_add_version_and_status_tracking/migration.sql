-- Add version and status-change tracking columns to Trip
ALTER TABLE "trips" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "trips" ADD COLUMN "status_changed_at" TIMESTAMP(3);
ALTER TABLE "trips" ADD COLUMN "status_changed_by" TEXT;

-- Add version column to Leg
ALTER TABLE "legs" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Add version and status-change tracking columns to Service
ALTER TABLE "services" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "services" ADD COLUMN "status_changed_at" TIMESTAMP(3);
ALTER TABLE "services" ADD COLUMN "status_changed_by" TEXT;
