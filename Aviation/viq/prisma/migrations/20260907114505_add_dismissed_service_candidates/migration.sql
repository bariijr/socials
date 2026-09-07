-- CreateTable
CREATE TABLE "dismissed_service_candidates" (
    "id" SERIAL NOT NULL,
    "trip_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "country_iso2" TEXT NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed_by" TEXT NOT NULL,

    CONSTRAINT "dismissed_service_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dismissed_service_candidates_trip_id_idx" ON "dismissed_service_candidates"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "dismissed_service_candidates_scope_type_scope_id_service_ty_key" ON "dismissed_service_candidates"("scope_type", "scope_id", "service_type", "country_iso2");
