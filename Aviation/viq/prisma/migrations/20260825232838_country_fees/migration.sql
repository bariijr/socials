-- CreateTable
CREATE TABLE "country_fees" (
    "id" SERIAL NOT NULL,
    "country_iso2" TEXT NOT NULL,
    "fee_type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT,
    "notes" TEXT,

    CONSTRAINT "country_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "country_fees_country_iso2_idx" ON "country_fees"("country_iso2");

-- AddForeignKey
ALTER TABLE "country_fees" ADD CONSTRAINT "country_fees_country_iso2_fkey" FOREIGN KEY ("country_iso2") REFERENCES "countries"("iso2") ON DELETE RESTRICT ON UPDATE CASCADE;
