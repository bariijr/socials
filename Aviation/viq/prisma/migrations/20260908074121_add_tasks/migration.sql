-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "trip_id" TEXT,
    "leg_id" TEXT,
    "service_id" TEXT,
    "client_id" TEXT,
    "owner_user_id" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "no_later_than_z" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Open',
    "status_changed_at" TIMESTAMP(3),
    "status_changed_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'Manual',
    "source_key" TEXT,
    "escalation_tier" TEXT,
    "escalated_at_z" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at_z" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_source_key_key" ON "tasks"("source_key");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_owner_user_id_idx" ON "tasks"("owner_user_id");

-- CreateIndex
CREATE INDEX "tasks_no_later_than_z_idx" ON "tasks"("no_later_than_z");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_leg_id_fkey" FOREIGN KEY ("leg_id") REFERENCES "legs"("leg_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("svc_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
