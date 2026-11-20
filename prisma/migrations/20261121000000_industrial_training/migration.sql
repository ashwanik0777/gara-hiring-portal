-- Careers portal update, Phase 3A (product owner plan, 2026-11-19): Industrial Training
-- programmes, batches, paid enrollments, Razorpay payments, refunds and webhook idempotency.
-- Amounts are integers in paise.

-- CreateEnum
CREATE TYPE "TrainingProgramStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TrainingBatchStatus" AS ENUM ('UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingEnrollmentStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'REFUND_REQUESTED', 'REFUNDED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingPaymentStatus" AS ENUM ('CREATED', 'CAPTURED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrainingRefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "training_programs" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trackId" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "syllabus" JSONB NOT NULL DEFAULT '[]',
    "durationWeeks" INTEGER NOT NULL,
    "feePaise" INTEGER NOT NULL,
    "prerequisites" TEXT,
    "outcomes" TEXT,
    "status" "TrainingProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_batches" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "firstClassAt" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "scheduleText" TEXT,
    "seats" INTEGER NOT NULL,
    "enrollmentDeadline" TIMESTAMP(3),
    "status" "TrainingBatchStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_enrollments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "TrainingEnrollmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "listPricePaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "amountPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "referralCode" TEXT,
    "receiptNo" TEXT,
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "seatHoldExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_payments" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "status" "TrainingPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_refunds" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "TrainingRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "razorpayRefundId" TEXT,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_programs_slug_key" ON "training_programs"("slug");

-- CreateIndex
CREATE INDEX "training_programs_status_idx" ON "training_programs"("status");

-- CreateIndex
CREATE INDEX "training_batches_programId_status_startDate_idx" ON "training_batches"("programId", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "training_enrollments_receiptNo_key" ON "training_enrollments"("receiptNo");

-- CreateIndex
CREATE INDEX "training_enrollments_batchId_status_idx" ON "training_enrollments"("batchId", "status");

-- CreateIndex
CREATE INDEX "training_enrollments_userId_idx" ON "training_enrollments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "training_enrollments_userId_batchId_key" ON "training_enrollments"("userId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "training_payments_razorpayOrderId_key" ON "training_payments"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "training_payments_razorpayPaymentId_key" ON "training_payments"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "training_payments_enrollmentId_idx" ON "training_payments"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "training_refunds_razorpayRefundId_key" ON "training_refunds"("razorpayRefundId");

-- CreateIndex
CREATE INDEX "training_refunds_status_requestedAt_idx" ON "training_refunds"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "training_refunds_enrollmentId_idx" ON "training_refunds"("enrollmentId");

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_batches" ADD CONSTRAINT "training_batches_programId_fkey" FOREIGN KEY ("programId") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "training_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_payments" ADD CONSTRAINT "training_payments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_refunds" ADD CONSTRAINT "training_refunds_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_refunds" ADD CONSTRAINT "training_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "training_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_refunds" ADD CONSTRAINT "training_refunds_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Money and seat counts are positive; discounts never exceed the price.
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_fee_positive" CHECK ("feePaise" > 0);
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_duration_positive" CHECK ("durationWeeks" > 0);
ALTER TABLE "training_batches" ADD CONSTRAINT "training_batches_seats_positive" CHECK ("seats" > 0);
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_amounts_valid"
  CHECK ("listPricePaise" > 0 AND "discountPaise" >= 0 AND "discountPaise" <= "listPricePaise" AND "amountPaidPaise" >= 0);
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_transfers_valid" CHECK ("transferCount" >= 0);
ALTER TABLE "training_payments" ADD CONSTRAINT "training_payments_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "training_refunds" ADD CONSTRAINT "training_refunds_amount_valid" CHECK ("amountPaise" >= 0);

-- Sequential receipt numbers (GARA-RCPT-{year}-{000001}); gaps are possible, reuse never.
CREATE SEQUENCE "training_receipt_seq" START 1;
