-- Phase 3B: Industrial Training learning area (sessions, attendance, assignments, final
-- project, demo slots, mentors, results, free re-attempts) and training certificates.

-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingProjectStatus" AS ENUM ('SUBMITTED', 'CHANGES_REQUESTED', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrainingDemoResult" AS ENUM ('PASSED', 'FAILED');

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "trainingEnrollmentId" TEXT,
ALTER COLUMN "enrollmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "training_enrollments" ADD COLUMN     "reattemptOfId" TEXT,
ADD COLUMN     "resultAt" TIMESTAMP(3),
ADD COLUMN     "resultById" TEXT,
ADD COLUMN     "resultNote" TEXT,
ADD COLUMN     "resultSnapshot" JSONB;

-- CreateTable
CREATE TABLE "training_batch_mentors" (
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_batch_mentors_pkey" PRIMARY KEY ("batchId","userId")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "meetingUrl" TEXT,
    "recordingUrl" TEXT,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attendanceTakenAt" TIMESTAMP(3),
    "attendanceTakenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_attendance" (
    "sessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("sessionId","enrollmentId")
);

-- CreateTable
CREATE TABLE "training_assignments" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_submissions" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "repoUrl" TEXT,
    "linkUrl" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "marks" INTEGER,
    "feedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_final_projects" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "repoUrl" TEXT NOT NULL,
    "liveUrl" TEXT,
    "status" "TrainingProjectStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "marks" INTEGER,
    "feedback" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_final_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_demo_slots" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "meetingUrl" TEXT,
    "bookedEnrollmentId" TEXT,
    "bookedAt" TIMESTAMP(3),
    "result" "TrainingDemoResult",
    "resultNote" TEXT,
    "resultAt" TIMESTAMP(3),
    "resultById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_demo_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_batch_mentors_userId_idx" ON "training_batch_mentors"("userId");

-- CreateIndex
CREATE INDEX "training_sessions_batchId_startsAt_idx" ON "training_sessions"("batchId", "startsAt");

-- CreateIndex
CREATE INDEX "training_attendance_enrollmentId_idx" ON "training_attendance"("enrollmentId");

-- CreateIndex
CREATE INDEX "training_assignments_batchId_dueAt_idx" ON "training_assignments"("batchId", "dueAt");

-- CreateIndex
CREATE INDEX "training_submissions_enrollmentId_idx" ON "training_submissions"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "training_submissions_assignmentId_enrollmentId_key" ON "training_submissions"("assignmentId", "enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "training_final_projects_enrollmentId_key" ON "training_final_projects"("enrollmentId");

-- CreateIndex
CREATE INDEX "training_demo_slots_batchId_startsAt_idx" ON "training_demo_slots"("batchId", "startsAt");

-- CreateIndex
CREATE INDEX "training_demo_slots_bookedEnrollmentId_idx" ON "training_demo_slots"("bookedEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_trainingEnrollmentId_key" ON "certificates"("trainingEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "training_enrollments_reattemptOfId_key" ON "training_enrollments"("reattemptOfId");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_trainingEnrollmentId_fkey" FOREIGN KEY ("trainingEnrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_reattemptOfId_fkey" FOREIGN KEY ("reattemptOfId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_batch_mentors" ADD CONSTRAINT "training_batch_mentors_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "training_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_batch_mentors" ADD CONSTRAINT "training_batch_mentors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "training_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "training_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_submissions" ADD CONSTRAINT "training_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "training_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_submissions" ADD CONSTRAINT "training_submissions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_final_projects" ADD CONSTRAINT "training_final_projects_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_demo_slots" ADD CONSTRAINT "training_demo_slots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "training_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_demo_slots" ADD CONSTRAINT "training_demo_slots_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_demo_slots" ADD CONSTRAINT "training_demo_slots_bookedEnrollmentId_fkey" FOREIGN KEY ("bookedEnrollmentId") REFERENCES "training_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A certificate comes from exactly one source: an internship or a training enrollment.
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_single_source"
  CHECK (num_nonnulls("enrollmentId", "trainingEnrollmentId") = 1);

ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_duration_valid" CHECK ("durationMinutes" BETWEEN 1 AND 600);
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_max_marks_positive" CHECK ("maxMarks" BETWEEN 1 AND 1000);
ALTER TABLE "training_submissions" ADD CONSTRAINT "training_submissions_marks_valid" CHECK ("marks" IS NULL OR "marks" >= 0);
ALTER TABLE "training_submissions" ADD CONSTRAINT "training_submissions_has_link" CHECK ("repoUrl" IS NOT NULL OR "linkUrl" IS NOT NULL);
ALTER TABLE "training_final_projects" ADD CONSTRAINT "training_final_projects_marks_valid" CHECK ("marks" IS NULL OR ("marks" BETWEEN 0 AND 100));
ALTER TABLE "training_demo_slots" ADD CONSTRAINT "training_demo_slots_duration_valid" CHECK ("durationMinutes" BETWEEN 5 AND 240);
-- A result needs a booking.
ALTER TABLE "training_demo_slots" ADD CONSTRAINT "training_demo_slots_result_needs_booking" CHECK ("result" IS NULL OR "bookedEnrollmentId" IS NOT NULL);
-- An enrollment is not its own re-attempt.
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_reattempt_not_self" CHECK ("reattemptOfId" IS NULL OR "reattemptOfId" <> "id");
