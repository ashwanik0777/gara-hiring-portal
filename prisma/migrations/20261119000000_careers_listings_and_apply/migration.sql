-- Careers portal update, Phase 2 (product owner plan, 2026-11-19).
-- Part A: listing details on openings and staff-managed career tracks.

-- AlterTable
ALTER TABLE "openings" ADD COLUMN     "applyDeadline" TIMESTAMP(3),
ADD COLUMN     "durationText" TEXT,
ADD COLUMN     "eligibility" TEXT,
ADD COLUMN     "openingsCount" INTEGER,
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stipendPolicyText" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "trackId" TEXT;

-- Positions are counted from one; "not stated" is NULL.
ALTER TABLE "openings" ADD CONSTRAINT "openings_openingsCount_positive"
  CHECK ("openingsCount" IS NULL OR "openingsCount" > 0);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracks_slug_key" ON "tracks"("slug");

-- CreateIndex
CREATE INDEX "tracks_isActive_sortOrder_idx" ON "tracks"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "openings_trackId_idx" ON "openings"("trackId");

-- CreateIndex
CREATE INDEX "openings_status_applyDeadline_idx" ON "openings"("status", "applyDeadline");

-- AddForeignKey
ALTER TABLE "openings" ADD CONSTRAINT "openings_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The tracks named in the product owner's plan; staff can rename, add or hide tracks later.
INSERT INTO "tracks" ("id", "slug", "name", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'software', 'Software Engineering', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'full-stack', 'Full Stack & Web', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ui-ux', 'UI/UX & Product Design', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ai-ml', 'AI & Machine Learning', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'cloud-backend', 'Cloud & Backend', 50, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Part B: apply flow (college master, education details, consent, one application per opening).

-- CreateEnum
CREATE TYPE "CollegeStatus" AS ENUM ('APPROVED', 'PENDING');

-- CreateTable
CREATE TABLE "colleges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "status" "CollegeStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colleges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "colleges_normalizedName_key" ON "colleges"("normalizedName");

-- CreateIndex
CREATE INDEX "colleges_status_name_idx" ON "colleges"("status", "name");

-- AddForeignKey
ALTER TABLE "colleges" ADD CONSTRAINT "colleges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "candidate_profiles" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "collegeId" TEXT,
ADD COLUMN     "graduationYear" INTEGER,
ADD COLUMN     "yearOfStudy" INTEGER;

-- Plausible values only; NULL means "not given".
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_yearOfStudy_range"
  CHECK ("yearOfStudy" IS NULL OR "yearOfStudy" BETWEEN 1 AND 6);
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_graduationYear_range"
  CHECK ("graduationYear" IS NULL OR "graduationYear" BETWEEN 1950 AND 2100);

-- CreateIndex
CREATE INDEX "candidate_profiles_collegeId_idx" ON "candidate_profiles"("collegeId");

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT;

-- One application per candidate per opening, ever (product owner, 2026-11-19). Production had
-- no duplicate (openingId, candidateId) pairs when this was written; the unique index replaces
-- the plain index on the same columns.
DROP INDEX "applications_openingId_candidateId_idx";
CREATE UNIQUE INDEX "applications_openingId_candidateId_key" ON "applications"("openingId", "candidateId");
