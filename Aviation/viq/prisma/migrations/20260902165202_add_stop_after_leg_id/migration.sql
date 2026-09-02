-- AlterTable
ALTER TABLE "stops" ADD COLUMN     "after_leg_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stops_after_leg_id_key" ON "stops"("after_leg_id");

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_after_leg_id_fkey" FOREIGN KEY ("after_leg_id") REFERENCES "legs"("leg_id") ON DELETE SET NULL ON UPDATE CASCADE;
