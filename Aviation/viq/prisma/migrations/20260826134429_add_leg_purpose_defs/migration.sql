-- CreateTable
CREATE TABLE "leg_purpose_defs" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "leg_purpose_defs_pkey" PRIMARY KEY ("code")
);
