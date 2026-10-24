import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { loadPayrollPageData } from "@/features/payroll/services/payroll-page-data";
import { PayrollPageView } from "@/features/payroll/components/payroll-page-view";

export const instant = false;

export const metadata = {
  title: "Payroll — SubAdmin Console",
  description: "Payroll cycles and disbursement records.",
};

export default async function SubAdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/payroll");
  if (user.mustChangePassword) redirect("/set-password");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  // Payroll requires the HR role (or ADMIN) together with the `canPayroll` permission.
  const { period } = await searchParams;
  const pageData = await loadPayrollPageData(user, period, { allowSelfView: false });

  return <PayrollPageView pageData={pageData} />;
}
