-- Printed certificate prices and delivery times are set by administrators (product owner,
-- 2026-11-21): one settings row instead of values in code. Courier orders are priced by zone
-- (NCR or outside NCR, from the PIN code); each order keeps its zone and the delivery time it
-- was promised.

-- CreateEnum
CREATE TYPE "PrintDeliveryZone" AS ENUM ('NCR', 'OUTSIDE_NCR');

-- AlterTable
ALTER TABLE "certificate_print_orders" ADD COLUMN     "deliveryZone" "PrintDeliveryZone",
ADD COLUMN     "expectedDelivery" TEXT;

-- Only courier orders have a zone. The type is compared as text so the check does not depend
-- on the enum created above in the same transaction.
ALTER TABLE "certificate_print_orders" ADD CONSTRAINT "certificate_print_orders_zone_courier_only" CHECK (
  "deliveryType"::text = 'COURIER' OR "deliveryZone" IS NULL
);

-- CreateTable
CREATE TABLE "print_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "orderingOpen" BOOLEAN NOT NULL DEFAULT false,
    "collegeBulkPricePaise" INTEGER,
    "courierNcrPricePaise" INTEGER,
    "courierOutsidePricePaise" INTEGER,
    "collegeBulkDelivery" TEXT,
    "courierNcrDelivery" TEXT,
    "courierOutsideDelivery" TEXT,
    "ncrPinPrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "courierPartner" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_settings_pkey" PRIMARY KEY ("id")
);

-- One row only; prices between ₹1 and ₹10,000; PIN prefixes are 2 to 6 digits, not starting
-- with 0, at most 50 of them; ordering opens only with at least one price.
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_single_row" CHECK ("id" = 1);
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_prices_valid" CHECK (
  ("collegeBulkPricePaise" IS NULL OR "collegeBulkPricePaise" BETWEEN 100 AND 1000000)
  AND ("courierNcrPricePaise" IS NULL OR "courierNcrPricePaise" BETWEEN 100 AND 1000000)
  AND ("courierOutsidePricePaise" IS NULL OR "courierOutsidePricePaise" BETWEEN 100 AND 1000000)
);
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_pin_prefixes_valid" CHECK (
  coalesce(cardinality("ncrPinPrefixes"), 0) <= 50
  AND array_to_string(coalesce("ncrPinPrefixes", ARRAY[]::TEXT[]), ',') ~ '^([1-9][0-9]{1,5}(,|$))*$'
);
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_open_needs_price" CHECK (
  NOT "orderingOpen"
  OR "collegeBulkPricePaise" IS NOT NULL
  OR "courierNcrPricePaise" IS NOT NULL
  OR "courierOutsidePricePaise" IS NOT NULL
);
