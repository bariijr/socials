-- CreateTable
CREATE TABLE "clients" (
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_operator" BOOLEAN NOT NULL DEFAULT false,
    "linked_operator_id" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "billing_address_line1" TEXT,
    "billing_address_line2" TEXT,
    "billing_city" TEXT,
    "billing_state" TEXT,
    "billing_postal_code" TEXT,
    "billing_country" TEXT,
    "billing_emails" TEXT[],
    "notes" TEXT,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("client_id")
);

-- AlterTable
ALTER TABLE "trips" ADD COLUMN "client_id" TEXT,
ADD COLUMN "owner_user_id" TEXT,
ADD COLUMN "team" TEXT,
ADD COLUMN "bill_to_address_line1" TEXT,
ADD COLUMN "bill_to_address_line2" TEXT,
ADD COLUMN "bill_to_city" TEXT,
ADD COLUMN "bill_to_state" TEXT,
ADD COLUMN "bill_to_postal_code" TEXT,
ADD COLUMN "bill_to_country" TEXT,
ADD COLUMN "bill_to_emails" TEXT[];

-- CreateIndex
CREATE INDEX "trips_client_id_idx" ON "trips"("client_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_linked_operator_id_fkey" FOREIGN KEY ("linked_operator_id") REFERENCES "operators"("operator_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
