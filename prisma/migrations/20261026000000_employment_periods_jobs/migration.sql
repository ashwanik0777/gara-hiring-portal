-- CreateEnum
CREATE TYPE "EmploymentPeriodStartReason" AS ENUM ('JOINED', 'REJOINED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "EmploymentPeriodEndReason" AS ENUM ('EXITED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ConversionReviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConversionReviewOutcome" AS ENUM ('CONVERT', 'EXTEND', 'END_INTERNSHIP');

-- CreateEnum
CREATE TYPE "ConversionOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- DropIndex
DROP INDEX "employee_exit_records_employeeId_key";

-- AlterTable
ALTER TABLE "notification_outbox" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "resumeUrl" TEXT;

-- AlterTable
ALTER TABLE "employee_exit_records" ADD COLUMN     "periodId" TEXT;

-- CreateTable
CREATE TABLE "employment_periods" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employmentType" "EmploymentType",
    "designation" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "startReason" "EmploymentPeriodStartReason" NOT NULL,
    "endReason" "EmploymentPeriodEndReason",
    "applicationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_reviews" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT,
    "reviewPeriodMonths" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ConversionReviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcome" "ConversionReviewOutcome",
    "reviewerId" TEXT,
    "internalNotes" TEXT,
    "sharedSummary" TEXT,
    "decidedAt" TIMESTAMP(3),
    "proposedDesignation" TEXT,
    "proposedDepartment" TEXT,
    "proposedEffectiveDate" TIMESTAMP(3),
    "proposedInitialStatus" "EmployeeStatus",
    "offerStatus" "ConversionOfferStatus",
    "offerRespondedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "dedupeKey" TEXT,
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_periods_employeeId_startDate_idx" ON "employment_periods"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "conversion_reviews_status_scheduledFor_idx" ON "conversion_reviews"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "conversion_reviews_employeeId_idx" ON "conversion_reviews"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_dedupeKey_key" ON "scheduled_jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "scheduled_jobs_status_runAt_idx" ON "scheduled_jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupeKey_key" ON "notification_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "applications_candidateId_idx" ON "applications"("candidateId");

-- CreateIndex
CREATE INDEX "applications_createdAt_idx" ON "applications"("createdAt");

-- CreateIndex
CREATE INDEX "interview_schedules_status_scheduledAt_idx" ON "interview_schedules"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "evaluation_checkpoints_status_idx" ON "evaluation_checkpoints"("status");

-- CreateIndex
CREATE INDEX "job_offers_status_idx" ON "job_offers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employee_exit_records_periodId_key" ON "employee_exit_records"("periodId");

-- CreateIndex
CREATE INDEX "employee_exit_records_employeeId_idx" ON "employee_exit_records"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_regularizations_status_idx" ON "attendance_regularizations"("status");

-- CreateIndex
CREATE INDEX "leave_requests_status_startDate_idx" ON "leave_requests"("status", "startDate");

-- AddForeignKey
ALTER TABLE "employee_exit_records" ADD CONSTRAINT "employee_exit_records_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "employment_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_periods" ADD CONSTRAINT "employment_periods_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_periods" ADD CONSTRAINT "employment_periods_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_reviews" ADD CONSTRAINT "conversion_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_reviews" ADD CONSTRAINT "conversion_reviews_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "employment_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_reviews" ADD CONSTRAINT "conversion_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: one employment period per existing employee (their current or last stint)
INSERT INTO "employment_periods"
  ("id", "employeeId", "employmentType", "designation", "department", "startDate", "endDate",
   "startReason", "endReason", "applicationId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  e."id",
  e."employmentType",
  e."designation",
  e."department",
  e."joiningDate",
  CASE WHEN e."status" = 'EXITED' THEN COALESCE(x."lastWorkingDate", e."updatedAt") END,
  'JOINED'::"EmploymentPeriodStartReason",
  CASE WHEN e."status" = 'EXITED' THEN 'EXITED'::"EmploymentPeriodEndReason" END,
  e."applicationId",
  NOW(),
  NOW()
FROM "employees" e
LEFT JOIN "employee_exit_records" x ON x."employeeId" = e."id";

-- Backfill: link existing exit records to that period
UPDATE "employee_exit_records" x
SET "periodId" = p."id"
FROM "employment_periods" p
WHERE p."employeeId" = x."employeeId";
