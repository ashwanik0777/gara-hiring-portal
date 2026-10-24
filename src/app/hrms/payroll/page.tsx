import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { loadPayrollPageData } from "@/features/payroll/services/payroll-page-data";
import { PayrollPageView } from "@/features/payroll/components/payroll-page-view";

export const instant = false;

export const metadata = {
  title: "Payroll — HRMS Console",
  description: "Payroll cycles and disbursement records.",
};

export default async function PayrollModulePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/hrms/payroll");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Team view only for ADMIN, or HR holding `canPayroll`; everyone else sees only
  // their own records (masked).
  const { period } = await searchParams;
  const pageData = await loadPayrollPageData(user, period, { allowSelfView: true });

  return <PayrollPageView pageData={pageData} />;
}
