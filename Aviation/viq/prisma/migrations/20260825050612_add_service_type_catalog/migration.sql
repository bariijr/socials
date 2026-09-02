-- AlterTable
ALTER TABLE "services" ADD COLUMN     "icao" TEXT,
ADD COLUMN     "variant" TEXT;

-- CreateTable
CREATE TABLE "service_type_defs" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "variants" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_type_defs_pkey" PRIMARY KEY ("code")
);
