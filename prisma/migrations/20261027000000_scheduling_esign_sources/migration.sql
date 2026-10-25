-- CreateEnum
CREATE TYPE "InterviewBookingStatus" AS ENUM ('PENDING', 'BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterviewSlotStatus" AS ENUM ('OPEN', 'BOOKED', 'RELEASED');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceDetail" TEXT;

-- AlterTable
ALTER TABLE "interview_schedules" ADD COLUMN     "icsSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "job_offers" ADD COLUMN     "signatureIpHash" TEXT,
ADD COLUMN     "signatureUserAgent" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedDocumentHash" TEXT,
ADD COLUMN     "signedName" TEXT;

-- CreateTable
CREATE TABLE "interview_booking_requests" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "roundName" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "interviewerId" TEXT,
    "meetingLink" TEXT,
    "status" "InterviewBookingStatus" NOT NULL DEFAULT 'PENDING',
    "bookedScheduleId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_slot_options" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "InterviewSlotStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "interview_slot_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_booking_requests_bookedScheduleId_key" ON "interview_booking_requests"("bookedScheduleId");

-- CreateIndex
CREATE INDEX "interview_booking_requests_applicationId_status_idx" ON "interview_booking_requests"("applicationId", "status");

-- CreateIndex
CREATE INDEX "interview_slot_options_requestId_status_idx" ON "interview_slot_options"("requestId", "status");

-- CreateIndex
CREATE INDEX "applications_source_idx" ON "applications"("source");

-- AddForeignKey
ALTER TABLE "interview_booking_requests" ADD CONSTRAINT "interview_booking_requests_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_booking_requests" ADD CONSTRAINT "interview_booking_requests_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_booking_requests" ADD CONSTRAINT "interview_booking_requests_bookedScheduleId_fkey" FOREIGN KEY ("bookedScheduleId") REFERENCES "interview_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_slot_options" ADD CONSTRAINT "interview_slot_options_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "interview_booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

