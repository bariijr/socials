-- Data-preserving restructuring: Person becomes a trip-independent roster
-- record; TripPersonAssignment (new) carries the per-trip role/hotel/ETA
-- that used to live directly on Person; PersonRating (new) allows a
-- person to hold several ratings.
--
-- 1. Create the new tables FIRST.
CREATE TABLE "trip_person_assignments" (
    "id" SERIAL NOT NULL,
    "trip_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "commercial_flight_eta" TIMESTAMP(3),
    "hotel" TEXT,

    CONSTRAINT "trip_person_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "person_ratings" (
    "id" SERIAL NOT NULL,
    "person_id" TEXT NOT NULL,
    "rating_type" TEXT NOT NULL,
    "issuing_authority" TEXT,
    "issue_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "person_ratings_pkey" PRIMARY KEY ("id")
);

-- 2. Copy every existing person's trip/role/hotel/ETA into the new
--    assignment table BEFORE those columns are dropped from persons.
INSERT INTO "trip_person_assignments" ("trip_id", "person_id", "role", "commercial_flight_eta", "hotel")
SELECT "trip_id", "person_id", "role", "commercial_flight_eta", "hotel" FROM "persons";

-- 3. Now it's safe to restructure persons — the data that lived in the
--    dropped columns has already been copied out.
ALTER TABLE "persons" DROP CONSTRAINT "persons_trip_id_fkey";
DROP INDEX "persons_trip_id_idx";

ALTER TABLE "persons" DROP COLUMN "commercial_flight_eta",
DROP COLUMN "hotel",
DROP COLUMN "role",
DROP COLUMN "trip_id",
ADD COLUMN     "default_role" TEXT,
ADD COLUMN     "medical_class" TEXT,
ADD COLUMN     "medical_examiner" TEXT,
ADD COLUMN     "passport_date_of_birth" TIMESTAMP(3),
ADD COLUMN     "passport_expiry_date" TIMESTAMP(3),
ADD COLUMN     "passport_issuing_country" TEXT,
ADD COLUMN     "passport_number" TEXT,
ADD COLUMN     "passport_sex" TEXT;

-- 4. Indexes and foreign keys for the new tables.
CREATE INDEX "person_ratings_person_id_idx" ON "person_ratings"("person_id");
CREATE INDEX "trip_person_assignments_trip_id_idx" ON "trip_person_assignments"("trip_id");
CREATE INDEX "trip_person_assignments_person_id_idx" ON "trip_person_assignments"("person_id");
CREATE UNIQUE INDEX "trip_person_assignments_trip_id_person_id_key" ON "trip_person_assignments"("trip_id", "person_id");

ALTER TABLE "person_ratings" ADD CONSTRAINT "person_ratings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_person_assignments" ADD CONSTRAINT "trip_person_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_person_assignments" ADD CONSTRAINT "trip_person_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
