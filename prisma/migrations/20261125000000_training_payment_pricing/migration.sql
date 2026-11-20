-- Each Razorpay order keeps its own pricing (list price, referral discount, code), so the order
-- that is actually paid decides the enrollment's discount and commission.

-- AlterTable
ALTER TABLE "training_payments" ADD COLUMN     "discountPaise" INTEGER,
ADD COLUMN     "listPricePaise" INTEGER,
ADD COLUMN     "referralCode" TEXT;


ALTER TABLE "training_payments" ADD CONSTRAINT "training_payments_pricing_valid"
  CHECK ("listPricePaise" IS NULL OR ("listPricePaise" > 0 AND "discountPaise" >= 0 AND "discountPaise" < "listPricePaise" AND "amountPaise" = "listPricePaise" - "discountPaise"));
