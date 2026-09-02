-- CreateTable
CREATE TABLE "countries" (
    "iso2" TEXT NOT NULL,
    "iso3" TEXT,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "sub_region" TEXT,
    "overflight_permit_required" BOOLEAN NOT NULL DEFAULT false,
    "landing_permit_required" BOOLEAN NOT NULL DEFAULT false,
    "aoc_docs_required" BOOLEAN NOT NULL DEFAULT false,
    "ciq_required" BOOLEAN NOT NULL DEFAULT false,
    "escalation_contact" TEXT,
    "caa_website" TEXT,
    "notes" TEXT,
    "centroid_lat" DOUBLE PRECISION NOT NULL,
    "centroid_lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("iso2")
);

-- CreateTable
CREATE TABLE "airports" (
    "icao" TEXT NOT NULL,
    "iata" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country_iso2" TEXT NOT NULL,
    "tz" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "elevation_ft" INTEGER,
    "runway_length_ft" INTEGER,
    "category" TEXT,
    "fbo_count" INTEGER,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("icao")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country_iso2" TEXT NOT NULL,
    "tz" TEXT,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircraft_types" (
    "icao_type" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "category" TEXT,
    "mtow_kg" DOUBLE PRECISION NOT NULL,
    "max_range_nm" DOUBLE PRECISION,
    "max_pax" INTEGER,
    "typical_pax" INTEGER,
    "crew_required" INTEGER,
    "max_crew" INTEGER,
    "cruise_speed_kts" INTEGER,
    "ceiling_ft" INTEGER,
    "fuel_burn_kg_per_hour" DOUBLE PRECISION,
    "noise_cert" TEXT,
    "wake_category" TEXT,
    "approach_category" TEXT,
    "landing_distance_ft" INTEGER,
    "takeoff_distance_ft" INTEGER,
    "wingspan_ft" DOUBLE PRECISION,
    "length_ft" DOUBLE PRECISION,
    "description" TEXT,

    CONSTRAINT "aircraft_types_pkey" PRIMARY KEY ("icao_type")
);

-- CreateTable
CREATE TABLE "aircraft" (
    "registration" TEXT NOT NULL,
    "icao_type" TEXT NOT NULL,
    "manufacturer_override" TEXT,
    "model_override" TEXT,
    "mtow_override_kg" DOUBLE PRECISION,
    "max_range_override_nm" DOUBLE PRECISION,
    "fuel_burn_override_kg_per_hour" DOUBLE PRECISION,
    "noise_cert_override" TEXT,
    "current_operator_id" TEXT,
    "previous_operators" TEXT[],
    "year_of_manufacture" INTEGER,
    "serial_number" TEXT,
    "insurance_valid_until" TIMESTAMP(3),
    "airworthiness_valid_until" TIMESTAMP(3),
    "home_base_icao" TEXT,
    "status" TEXT DEFAULT 'Active',
    "notes" TEXT,

    CONSTRAINT "aircraft_pkey" PRIMARY KEY ("registration")
);

-- CreateTable
CREATE TABLE "operators" (
    "operator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "fleet" TEXT[],
    "primary_contact" TEXT,
    "billing_address" TEXT,
    "payment_terms" TEXT,
    "status" TEXT DEFAULT 'Active',
    "notes" TEXT,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("operator_id")
);

-- CreateTable
CREATE TABLE "providers" (
    "provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service_types" TEXT[],
    "scope_type" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "email" TEXT,
    "aog_contact" TEXT,
    "working_hours_z" TEXT,
    "currency" TEXT,
    "payment_terms" TEXT,
    "rating" INTEGER,
    "contract_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("provider_id")
);

-- CreateTable
CREATE TABLE "country_rules" (
    "id" SERIAL NOT NULL,
    "country_iso2" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "lead_time_hours" INTEGER NOT NULL,
    "working_days_only" BOOLEAN NOT NULL DEFAULT false,
    "tolerance_hours" INTEGER NOT NULL DEFAULT 0,
    "exception_airports" TEXT[],
    "docs_required" TEXT[],
    "notes" TEXT,

    CONSTRAINT "country_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icao_rules" (
    "icao" TEXT NOT NULL,
    "inherited_country_iso2" TEXT,
    "rules" JSONB NOT NULL,
    "exceptions" TEXT[],
    "preferred_providers" TEXT[],

    CONSTRAINT "icao_rules_pkey" PRIMARY KEY ("icao")
);

-- CreateTable
CREATE TABLE "doc_templates" (
    "doc_type" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "required_for" TEXT[],
    "validity_required" BOOLEAN NOT NULL DEFAULT false,
    "default_validity_months" INTEGER,
    "issued_by" TEXT,
    "format" TEXT,

    CONSTRAINT "doc_templates_pkey" PRIMARY KEY ("doc_type")
);

-- CreateTable
CREATE TABLE "price_list" (
    "id" SERIAL NOT NULL,
    "provider_id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "unit" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,

    CONSTRAINT "price_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "trip_id" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "operator" TEXT,
    "registration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Planning',
    "owner" TEXT,
    "created_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "support_ref" TEXT,
    "operation_type" TEXT,
    "mission_type" TEXT,
    "notes" TEXT,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "legs" (
    "leg_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "dep_icao" TEXT NOT NULL,
    "arr_icao" TEXT NOT NULL,
    "etd_z" TIMESTAMP(3) NOT NULL,
    "eta_z" TIMESTAMP(3) NOT NULL,
    "block_hours" DOUBLE PRECISION NOT NULL,
    "pax_count" INTEGER NOT NULL DEFAULT 0,
    "crew_count" INTEGER NOT NULL DEFAULT 0,
    "countries_overflown" TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "call_sign" TEXT,

    CONSTRAINT "legs_pkey" PRIMARY KEY ("leg_id")
);

-- CreateTable
CREATE TABLE "stops" (
    "stop_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "icao" TEXT NOT NULL,
    "arr_z" TIMESTAMP(3) NOT NULL,
    "dep_z" TIMESTAMP(3) NOT NULL,
    "ground_time_hours" DOUBLE PRECISION NOT NULL,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "stops_pkey" PRIMARY KEY ("stop_id")
);

-- CreateTable
CREATE TABLE "services" (
    "svc_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "provider_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Not Started',
    "ref_number" TEXT NOT NULL DEFAULT '',
    "based_on_etd_z" TIMESTAMP(3) NOT NULL,
    "required_by_z" TIMESTAMP(3) NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'OK',
    "assigned_to" TEXT NOT NULL DEFAULT 'Unassigned',
    "notes" TEXT NOT NULL DEFAULT '',
    "sub_items" JSONB,
    "confirmed_by" TEXT,
    "confirmed_at_z" TIMESTAMP(3),
    "validity_z" TIMESTAMP(3),
    "sent_to_captain" BOOLEAN,
    "attachments" TEXT[],
    "country_iso2" TEXT,

    CONSTRAINT "services_pkey" PRIMARY KEY ("svc_id")
);

-- CreateTable
CREATE TABLE "persons" (
    "person_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "licence_number" TEXT,
    "medical_valid_until" TIMESTAMP(3),
    "passport_nationality" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "commercial_flight_eta" TIMESTAMP(3),
    "hotel" TEXT,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "docs" (
    "doc_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "svc_id" TEXT,
    "doc_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" TEXT NOT NULL,
    "valid_until" TIMESTAMP(3),

    CONSTRAINT "docs_pkey" PRIMARY KEY ("doc_id")
);

-- CreateTable
CREATE TABLE "comms" (
    "comm_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "svc_id" TEXT,
    "token" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "timestamp_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Draft',

    CONSTRAINT "comms_pkey" PRIMARY KEY ("comm_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "timestamp_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT NOT NULL,
    "table" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "invoice_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "issue_date_z" TIMESTAMP(3) NOT NULL,
    "due_date_z" TIMESTAMP(3) NOT NULL,
    "line_items" JSONB NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax_rate" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sent_to" TEXT,
    "sent_at_z" TIMESTAMP(3),
    "paid_at_z" TIMESTAMP(3),
    "payment_method" TEXT,
    "qr_code" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "attachments" TEXT[],
    "change_log" JSONB NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_country_iso2_key" ON "cities"("name", "country_iso2");

-- CreateIndex
CREATE UNIQUE INDEX "country_rules_country_iso2_service_type_key" ON "country_rules"("country_iso2", "service_type");

-- CreateIndex
CREATE INDEX "legs_trip_id_idx" ON "legs"("trip_id");

-- CreateIndex
CREATE INDEX "stops_trip_id_idx" ON "stops"("trip_id");

-- CreateIndex
CREATE INDEX "services_trip_id_idx" ON "services"("trip_id");

-- CreateIndex
CREATE INDEX "services_scope_type_scope_id_idx" ON "services"("scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "persons_trip_id_idx" ON "persons"("trip_id");

-- CreateIndex
CREATE INDEX "docs_trip_id_idx" ON "docs"("trip_id");

-- CreateIndex
CREATE INDEX "comms_trip_id_idx" ON "comms"("trip_id");

-- CreateIndex
CREATE INDEX "audit_log_table_record_id_idx" ON "audit_log"("table", "record_id");

-- CreateIndex
CREATE INDEX "invoices_trip_id_idx" ON "invoices"("trip_id");

-- AddForeignKey
ALTER TABLE "airports" ADD CONSTRAINT "airports_country_iso2_fkey" FOREIGN KEY ("country_iso2") REFERENCES "countries"("iso2") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_icao_type_fkey" FOREIGN KEY ("icao_type") REFERENCES "aircraft_types"("icao_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_rules" ADD CONSTRAINT "country_rules_country_iso2_fkey" FOREIGN KEY ("country_iso2") REFERENCES "countries"("iso2") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("provider_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legs" ADD CONSTRAINT "legs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("provider_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docs" ADD CONSTRAINT "docs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms" ADD CONSTRAINT "comms_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
