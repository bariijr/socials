-- CreateTable
CREATE TABLE "trip_id_counters" (
    "prefix" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trip_id_counters_pkey" PRIMARY KEY ("prefix")
);

-- Backfill: seed each existing trip-ID prefix's counter from the current
-- max suffix, so the first call to nextTripId() after this migration
-- continues the sequence instead of restarting at 001 and colliding with
-- an existing trip.
INSERT INTO "trip_id_counters" ("prefix", "count")
SELECT LEFT("trip_id", 4) AS prefix, MAX(CAST(RIGHT("trip_id", 3) AS INTEGER)) AS count
FROM "trips"
GROUP BY LEFT("trip_id", 4)
ON CONFLICT ("prefix") DO UPDATE SET "count" = GREATEST("trip_id_counters"."count", EXCLUDED."count");
