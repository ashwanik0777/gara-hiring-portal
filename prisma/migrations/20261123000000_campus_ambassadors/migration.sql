-- Phase 4: Campus Ambassador programme (applications, referral codes and clicks, sign-up
-- attribution, commission ledger, payouts) and Campus Ambassador certificates.

-- CreateEnum
CREATE TYPE "AmbassadorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "AmbassadorRole" AS ENUM ('LEAD', 'ASSOCIATE');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "AmbassadorPayoutMethod" AS ENUM ('RAZORPAYX', 'MANUAL');

-- CreateEnum
CREATE TYPE "AmbassadorPayoutStatus" AS ENUM ('PROCESSING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "referredAt" TIMESTAMP(3),
ADD COLUMN     "referredByAmbassadorId" TEXT;

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "ambassadorId" TEXT;

-- CreateTable
CREATE TABLE "campus_ambassadors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collegeId" TEXT,
    "phone" TEXT NOT NULL,
    "branch" TEXT,
    "yearOfStudy" INTEGER,
    "motivation" TEXT NOT NULL,
    "socialReach" TEXT,
    "pastExperience" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "status" "AmbassadorStatus" NOT NULL DEFAULT 'PENDING',
    "role" "AmbassadorRole",
    "referralCode" TEXT,
    "approvedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "duplicateFlag" TEXT,
    "upiIdEncrypted" TEXT,
    "upiIdMasked" TEXT,
    "razorpayContactId" TEXT,
    "razorpayFundAccountId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_ambassadors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_click_daily" (
    "ambassadorId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "referral_click_daily_pkey" PRIMARY KEY ("ambassadorId","day")
);

-- CreateTable
CREATE TABLE "ambassador_commissions" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "payableAt" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambassador_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ambassador_payouts" (
    "id" TEXT NOT NULL,
    "ambassadorId" TEXT NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "tdsPaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL,
    "method" "AmbassadorPayoutMethod" NOT NULL,
    "status" "AmbassadorPayoutStatus" NOT NULL DEFAULT 'PROCESSING',
    "razorpayPayoutId" TEXT,
    "utr" TEXT,
    "failureReason" TEXT,
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambassador_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campus_ambassadors_userId_key" ON "campus_ambassadors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "campus_ambassadors_referralCode_key" ON "campus_ambassadors"("referralCode");

-- CreateIndex
CREATE INDEX "campus_ambassadors_status_collegeId_idx" ON "campus_ambassadors"("status", "collegeId");

-- CreateIndex
CREATE INDEX "campus_ambassadors_phone_idx" ON "campus_ambassadors"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "ambassador_commissions_enrollmentId_key" ON "ambassador_commissions"("enrollmentId");

-- CreateIndex
CREATE INDEX "ambassador_commissions_ambassadorId_status_idx" ON "ambassador_commissions"("ambassadorId", "status");

-- CreateIndex
CREATE INDEX "ambassador_commissions_payoutId_idx" ON "ambassador_commissions"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "ambassador_payouts_razorpayPayoutId_key" ON "ambassador_payouts"("razorpayPayoutId");

-- CreateIndex
CREATE INDEX "ambassador_payouts_ambassadorId_createdAt_idx" ON "ambassador_payouts"("ambassadorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_ambassadorId_key" ON "certificates"("ambassadorId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referredByAmbassadorId_fkey" FOREIGN KEY ("referredByAmbassadorId") REFERENCES "campus_ambassadors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "campus_ambassadors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_ambassadors" ADD CONSTRAINT "campus_ambassadors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_ambassadors" ADD CONSTRAINT "campus_ambassadors_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_click_daily" ADD CONSTRAINT "referral_click_daily_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "campus_ambassadors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "campus_ambassadors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ambassador_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambassador_payouts" ADD CONSTRAINT "ambassador_payouts_ambassadorId_fkey" FOREIGN KEY ("ambassadorId") REFERENCES "campus_ambassadors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A certificate comes from exactly one source: an internship, a training enrollment or an ambassador.
ALTER TABLE "certificates" DROP CONSTRAINT "certificates_single_source";
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_single_source"
  CHECK (num_nonnulls("enrollmentId", "trainingEnrollmentId", "ambassadorId") = 1);

-- One Lead per college among approved ambassadors (product-owner plan).
CREATE UNIQUE INDEX "campus_ambassadors_one_lead_per_college"
  ON "campus_ambassadors"("collegeId") WHERE "role" = 'LEAD' AND "status" = 'APPROVED';

ALTER TABLE "campus_ambassadors" ADD CONSTRAINT "campus_ambassadors_approved_has_code"
  CHECK ("status" <> 'APPROVED' OR ("referralCode" IS NOT NULL AND "role" IS NOT NULL));
ALTER TABLE "campus_ambassadors" ADD CONSTRAINT "campus_ambassadors_year_valid" CHECK ("yearOfStudy" IS NULL OR "yearOfStudy" BETWEEN 1 AND 6);
ALTER TABLE "referral_click_daily" ADD CONSTRAINT "referral_click_daily_clicks_valid" CHECK ("clicks" >= 0);
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "ambassador_payouts" ADD CONSTRAINT "ambassador_payouts_amounts_valid"
  CHECK ("grossPaise" > 0 AND "tdsPaise" >= 0 AND "netPaise" > 0 AND "netPaise" = "grossPaise" - "tdsPaise");
ALTER TABLE "ambassador_payouts" ADD CONSTRAINT "ambassador_payouts_manual_has_utr" CHECK ("method" <> 'MANUAL' OR "utr" IS NOT NULL);
