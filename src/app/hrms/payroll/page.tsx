import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { isStaffUser, requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { PayrollPageSection } from "@/features/payroll/components/payroll-page-section";
import { PayrollPageSkeleton } from "@/features/payroll/components/payroll-page-skeleton";
import type { RawSearchParams } from "@/features/payroll/services/payroll-page-data";

export const instant = false;

export const metadata = {
  title: "Payroll — HRMS Console",
  description: "Payroll cycles and disbursement records.",
};

export default async function PayrollModulePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/payroll");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Interns and employees reach this page through their lifecycle stage; staff keep the team view.
  if (!isStaffUser(user)) {
    await requirePortalCapability("payslips", { callbackPath: "/hrms/payroll" });
  }

  // Team view only for ADMIN, or HR holding `canPayroll`; everyone else sees only
  // their own records (masked).
  return (
    <Suspense fallback={<PayrollPageSkeleton />}>
      <PayrollPageSection user={user} searchParams={searchParams} allowSelfView basePath="/hrms/payroll" />
    </Suspense>
  );
}
