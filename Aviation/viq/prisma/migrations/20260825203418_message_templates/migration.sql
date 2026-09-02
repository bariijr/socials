-- CreateTable
CREATE TABLE "message_templates" (
    "id" SERIAL NOT NULL,
    "country_iso2" TEXT NOT NULL,
    "template_type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_by" TEXT,
    "updated_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_templates_country_iso2_idx" ON "message_templates"("country_iso2");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_country_iso2_template_type_key" ON "message_templates"("country_iso2", "template_type");

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_country_iso2_fkey" FOREIGN KEY ("country_iso2") REFERENCES "countries"("iso2") ON DELETE RESTRICT ON UPDATE CASCADE;
