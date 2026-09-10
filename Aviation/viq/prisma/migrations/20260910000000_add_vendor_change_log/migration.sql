CREATE TABLE "vendor_change_logs" (
    "id" TEXT NOT NULL,
    "svc_id" TEXT NOT NULL,
    "from_provider_id" TEXT NOT NULL,
    "to_provider_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "cancellation_comm_id" TEXT,
    "new_request_comm_id" TEXT,
    "changed_by" TEXT NOT NULL,
    "changed_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_change_logs_svc_id_idx" ON "vendor_change_logs"("svc_id");

ALTER TABLE "vendor_change_logs" ADD CONSTRAINT "vendor_change_logs_svc_id_fkey" FOREIGN KEY ("svc_id") REFERENCES "services"("svc_id") ON DELETE CASCADE ON UPDATE CASCADE;
