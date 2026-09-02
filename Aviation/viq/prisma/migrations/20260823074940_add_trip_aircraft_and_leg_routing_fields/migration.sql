-- AlterTable
ALTER TABLE "legs" ADD COLUMN     "avoid_firs" TEXT[],
ADD COLUMN     "include_firs" TEXT[],
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "routing" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "aircraft_icao_type" TEXT,
ADD COLUMN     "aircraft_mtow_kg" DOUBLE PRECISION,
ADD COLUMN     "aircraft_serial_number" TEXT;
