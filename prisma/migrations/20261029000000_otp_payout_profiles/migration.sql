-- AlterTable
ALTER TABLE "users" ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "two_factors" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payout_profiles" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL,
    "employmentType" "EmploymentType",
    "stipendAmount" DECIMAL(12,2),
    "bankName" TEXT,
    "accountNumberEncrypted" TEXT,
    "accountNumberLast4" TEXT,
    "ifscCode" TEXT,
    "accountHolderName" TEXT,
    "panEncrypted" TEXT,
    "panLast4" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "two_factors_userId_idx" ON "two_factors"("userId");

-- CreateIndex
CREATE INDEX "two_factors_secret_idx" ON "two_factors"("secret");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payout_profiles_employeeId_key" ON "employee_payout_profiles"("employeeId");

-- CreateIndex
CREATE INDEX "employee_payout_profiles_isPaid_idx" ON "employee_payout_profiles"("isPaid");

-- CreateIndex
CREATE INDEX "employee_payout_profiles_employmentType_idx" ON "employee_payout_profiles"("employmentType");

-- CreateIndex
CREATE INDEX "candidate_profiles_careerInterest_idx" ON "candidate_profiles"("careerInterest");

-- CreateIndex
CREATE INDEX "candidate_profiles_createdAt_idx" ON "candidate_profiles"("createdAt");

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payout_profiles" ADD CONSTRAINT "employee_payout_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payout_profiles" ADD CONSTRAINT "employee_payout_profiles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: one two-factor row per existing user so the account-level lockout applies to them.
-- (The secret and backup codes are unused placeholders; sign-in codes are emailed.)
INSERT INTO "two_factors" ("id", "secret", "backupCodes", "userId")
SELECT gen_random_uuid()::text, md5(random()::text || clock_timestamp()::text || u."id"), '[]', u."id"
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "two_factors" t WHERE t."userId" = u."id");

-- Guard: payout details now live in "employee_payout_profiles". Refuse to continue while any
-- employee still carries the legacy PAYROLL_PROFILE block in internal notes, so no payout
-- data is silently left behind.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "employees" WHERE "internalNotes" LIKE '%PAYROLL_PROFILE:%') THEN
    RAISE EXCEPTION 'Legacy payout profiles found in employees.internalNotes; move them to employee_payout_profiles before applying this migration';
  END IF;
END $$;
