-- CreateTable
CREATE TABLE "leg_person_assignments" (
    "id" SERIAL NOT NULL,
    "leg_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "commercial_flight_eta" TIMESTAMP(3),
    "hotel" TEXT,

    CONSTRAINT "leg_person_assignments_pkey" PRIMARY KEY ("id")
);

-- Fan out each existing trip-wide assignment to every leg of that trip.
-- Must run while "trip_person_assignments" still exists, before it is dropped.
INSERT INTO "leg_person_assignments" ("leg_id", "person_id", "role", "commercial_flight_eta", "hotel")
SELECT l."leg_id", tpa."person_id", tpa."role", tpa."commercial_flight_eta", tpa."hotel"
FROM "trip_person_assignments" tpa
JOIN "legs" l ON l."trip_id" = tpa."trip_id";

-- CreateIndex
CREATE UNIQUE INDEX "leg_person_assignments_leg_id_person_id_key" ON "leg_person_assignments"("leg_id", "person_id");

-- CreateIndex
CREATE INDEX "leg_person_assignments_leg_id_idx" ON "leg_person_assignments"("leg_id");

-- CreateIndex
CREATE INDEX "leg_person_assignments_person_id_idx" ON "leg_person_assignments"("person_id");

-- AddForeignKey
ALTER TABLE "leg_person_assignments" ADD CONSTRAINT "leg_person_assignments_leg_id_fkey" FOREIGN KEY ("leg_id") REFERENCES "legs"("leg_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leg_person_assignments" ADD CONSTRAINT "leg_person_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "trip_person_assignments" DROP CONSTRAINT "trip_person_assignments_person_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_person_assignments" DROP CONSTRAINT "trip_person_assignments_trip_id_fkey";

-- DropTable
DROP TABLE "trip_person_assignments";
