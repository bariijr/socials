ALTER TABLE "legs" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "legs" ADD COLUMN "cancellation_remarks" TEXT;
ALTER TABLE "legs" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "legs" ADD COLUMN "cancelled_at_z" TIMESTAMP(3);

ALTER TABLE "services" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "services" ADD COLUMN "cancellation_remarks" TEXT;
ALTER TABLE "services" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "services" ADD COLUMN "cancelled_at_z" TIMESTAMP(3);

ALTER TABLE "trips" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "trips" ADD COLUMN "cancellation_remarks" TEXT;
ALTER TABLE "trips" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "trips" ADD COLUMN "cancelled_at_z" TIMESTAMP(3);
