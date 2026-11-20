-- Phase 3C: printed certificate orders (optional paid add-on for Industrial Training certificates).

-- CreateEnum
CREATE TYPE "PrintDeliveryType" AS ENUM ('COLLEGE_BULK', 'COURIER');

-- CreateEnum
CREATE TYPE "PrintOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PRINTED', 'SHIPPED', 'DELIVERED');

-- CreateTable
CREATE TABLE "certificate_print_orders" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveryType" "PrintDeliveryType" NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "collegeName" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "status" "PrintOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "receiptNo" TEXT,
    "courierName" TEXT,
    "trackingNo" TEXT,
    "printedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_print_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_print_orders_razorpayOrderId_key" ON "certificate_print_orders"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_print_orders_razorpayPaymentId_key" ON "certificate_print_orders"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_print_orders_receiptNo_key" ON "certificate_print_orders"("receiptNo");

-- CreateIndex
CREATE INDEX "certificate_print_orders_userId_createdAt_idx" ON "certificate_print_orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "certificate_print_orders_status_createdAt_idx" ON "certificate_print_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "certificate_print_orders_certificateId_idx" ON "certificate_print_orders"("certificateId");

-- AddForeignKey
ALTER TABLE "certificate_print_orders" ADD CONSTRAINT "certificate_print_orders_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_print_orders" ADD CONSTRAINT "certificate_print_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "certificate_print_orders" ADD CONSTRAINT "certificate_print_orders_amount_positive" CHECK ("amountPaise" > 0);
-- A courier order carries a full address; a bulk order the college.
ALTER TABLE "certificate_print_orders" ADD CONSTRAINT "certificate_print_orders_destination"
  CHECK (
    ("deliveryType" = 'COURIER' AND "addressLine1" IS NOT NULL AND "city" IS NOT NULL AND "state" IS NOT NULL AND "pincode" IS NOT NULL)
    OR ("deliveryType" = 'COLLEGE_BULK' AND "collegeName" IS NOT NULL)
  );
-- A shipped courier order has a tracking number.
ALTER TABLE "certificate_print_orders" ADD CONSTRAINT "certificate_print_orders_tracking"
  CHECK ("deliveryType" <> 'COURIER' OR "status" NOT IN ('SHIPPED', 'DELIVERED') OR "trackingNo" IS NOT NULL);
