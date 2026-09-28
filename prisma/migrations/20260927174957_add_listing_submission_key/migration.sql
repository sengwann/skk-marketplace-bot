-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('PENDING', 'APPROVING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ListingAvailability" AS ENUM ('AVAILABLE', 'SOLD_OUT');

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "seller_telegram_id" BIGINT NOT NULL,
    "seller_username" TEXT,
    "seller_first_name" TEXT,
    "product_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "price_amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "note" TEXT,
    "contact" TEXT NOT NULL,
    "photo_file_ids" TEXT[],
    "status" "ListingStatus" NOT NULL DEFAULT 'PENDING',
    "availability" "ListingAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "rejection_reason" TEXT,
    "channel_message_id" BIGINT,
    "submission_key" TEXT,
    "original_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "listings_submission_key_key" ON "listings"("submission_key");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_availability_idx" ON "listings"("availability");

-- CreateIndex
CREATE INDEX "listings_seller_telegram_id_idx" ON "listings"("seller_telegram_id");

-- CreateIndex
CREATE INDEX "listings_created_at_idx" ON "listings"("created_at");
