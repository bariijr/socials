-- CreateIndex
CREATE INDEX "audit_log_timestamp_z_idx" ON "audit_log"("timestamp_z");

-- CreateIndex
CREATE INDEX "services_urgency_idx" ON "services"("urgency");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_created_z_idx" ON "trips"("created_z");
