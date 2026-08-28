-- CreateTable
CREATE TABLE "contact_channels" (
    "id" SERIAL NOT NULL,
    "channel_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "for_billing" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "provider_id" TEXT,
    "operator_id" TEXT,
    "client_id" TEXT,
    "person_id" TEXT,

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_channels_provider_id_idx" ON "contact_channels"("provider_id");
CREATE INDEX "contact_channels_operator_id_idx" ON "contact_channels"("operator_id");
CREATE INDEX "contact_channels_client_id_idx" ON "contact_channels"("client_id");
CREATE INDEX "contact_channels_person_id_idx" ON "contact_channels"("person_id");

-- AddForeignKey
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("provider_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("operator_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single-value contact data into contact_channels before
-- dropping the legacy columns. Each migrated value is marked preferred
-- (it was the only value that entity had).
INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "provider_id")
SELECT 'Email', "email", true, false, 0, "provider_id" FROM "providers" WHERE "email" IS NOT NULL AND "email" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "provider_id")
SELECT 'Phone', "aog_contact", true, false, 1, "provider_id" FROM "providers" WHERE "aog_contact" IS NOT NULL AND "aog_contact" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "operator_id")
SELECT 'Email', "email", true, false, 0, "operator_id" FROM "operators" WHERE "email" IS NOT NULL AND "email" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "operator_id")
SELECT 'Phone', "phone", true, false, 1, "operator_id" FROM "operators" WHERE "phone" IS NOT NULL AND "phone" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "client_id")
SELECT 'Email', "contact_email", true, false, 0, "client_id" FROM "clients" WHERE "contact_email" IS NOT NULL AND "contact_email" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "client_id")
SELECT 'Phone', "contact_phone", true, false, 1, "client_id" FROM "clients" WHERE "contact_phone" IS NOT NULL AND "contact_phone" <> '';

-- billing_emails is an array — unnest() produces one row per element;
-- WHERE guards against both NULL and empty arrays.
INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "client_id")
SELECT 'Email', unnest("billing_emails"), false, true, 2, "client_id" FROM "clients" WHERE "billing_emails" IS NOT NULL AND array_length("billing_emails", 1) > 0;

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "person_id")
SELECT 'Phone', "phone", true, false, 0, "person_id" FROM "persons" WHERE "phone" IS NOT NULL AND "phone" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "person_id")
SELECT 'Email', "email", true, false, 1, "person_id" FROM "persons" WHERE "email" IS NOT NULL AND "email" <> '';

-- Drop legacy columns now that their data lives in contact_channels.
ALTER TABLE "providers" DROP COLUMN "email";
ALTER TABLE "providers" DROP COLUMN "aog_contact";
ALTER TABLE "operators" DROP COLUMN "email";
ALTER TABLE "operators" DROP COLUMN "phone";
ALTER TABLE "clients" DROP COLUMN "contact_email";
ALTER TABLE "clients" DROP COLUMN "contact_phone";
ALTER TABLE "clients" DROP COLUMN "billing_emails";
ALTER TABLE "persons" DROP COLUMN "phone";
ALTER TABLE "persons" DROP COLUMN "email";
