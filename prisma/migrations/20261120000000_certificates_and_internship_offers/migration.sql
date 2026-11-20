-- Careers portal update, Phase 5 (product owner plan, 2026-11-19): certificate types and the
-- details printed on certificates, and internship offer letters.
-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('INTERNSHIP_COMPLETION', 'TRAINING_COMPLETION', 'CAMPUS_AMBASSADOR');

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "collegeName" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "projectTitle" TEXT,
ADD COLUMN     "secondSignatoryName" TEXT,
ADD COLUMN     "secondSignatoryTitle" TEXT,
ADD COLUMN     "type" "CertificateType" NOT NULL DEFAULT 'INTERNSHIP_COMPLETION';

-- CreateTable
CREATE TABLE "internship_offers" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "tenureText" TEXT NOT NULL,
    "stipendText" TEXT,
    "signatoryName" TEXT NOT NULL,
    "signatoryTitle" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internship_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internship_offers_applicationId_key" ON "internship_offers"("applicationId");

-- AddForeignKey
ALTER TABLE "internship_offers" ADD CONSTRAINT "internship_offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_offers" ADD CONSTRAINT "internship_offers_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

