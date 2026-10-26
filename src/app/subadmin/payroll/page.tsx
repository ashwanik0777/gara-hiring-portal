import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { PayrollPageSection } from "@/features/payroll/components/payroll-page-section";
import { PayrollPageSkeleton } from "@/features/payroll/components/payroll-page-skeleton";
import type { RawSearchParams } from "@/features/payroll/services/payroll-page-data";

export const instant = false;

export const metadata = {
  title: "Payroll — SubAdmin Console",
  description: "Payroll cycles and disbursement records.",
};

export default async function SubAdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/payroll");
  if (user.mustChangePassword) redirect("/set-password");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  // Payroll requires the HR role (or ADMIN) together with the `canPayroll` permission.
  return (
    <Suspense fallback={<PayrollPageSkeleton />}>
      <PayrollPageSection user={user} searchParams={searchParams} allowSelfView={false} basePath="/subadmin/payroll" />
    </Suspense>
  );
}
