-- Campus Ambassador commissions are paid at GARA's discretion (product owner, 2026-11-21):
-- an administrator reviews each earned commission and approves or declines it; only approved
-- commissions can be paid out.

-- AlterEnum (the new values are not used elsewhere in this migration)
ALTER TYPE "CommissionStatus" ADD VALUE 'APPROVED';
ALTER TYPE "CommissionStatus" ADD VALUE 'DECLINED';

-- AlterTable
ALTER TABLE "ambassador_commissions" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AddForeignKey
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A reviewed commission records when; a declined one records why. The status is compared as
-- text so the check does not use the enum values added above in the same transaction.
ALTER TABLE "ambassador_commissions" ADD CONSTRAINT "ambassador_commissions_review_valid" CHECK (
  ("status"::text NOT IN ('APPROVED', 'DECLINED') OR "reviewedAt" IS NOT NULL)
  AND ("status"::text <> 'DECLINED' OR length(btrim(coalesce("reviewNote", ''))) >= 5)
);
