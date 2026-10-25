-- CreateEnum
CREATE TYPE "CareerInterest" AS ENUM ('JOB', 'INTERNSHIP', 'BOTH');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'INTERN');

-- AlterTable
ALTER TABLE "candidate_profiles" ADD COLUMN     "careerInterest" "CareerInterest";

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "employmentType" "EmploymentType";

