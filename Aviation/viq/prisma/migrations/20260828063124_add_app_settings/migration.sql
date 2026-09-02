-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "appName" TEXT NOT NULL DEFAULT 'VIQ',
    "tagline" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" TEXT,
    "domain" TEXT,
    "subdomains" TEXT[],
    "logo_path" TEXT,
    "logo_mime_type" TEXT,
    "favicon_path" TEXT,
    "favicon_mime_type" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
