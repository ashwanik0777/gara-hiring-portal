import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { loadPayrollPageData } from "@/features/payroll/services/payroll-page-data";
import { PayrollPageView } from "@/features/payroll/components/payroll-page-view";

export const instant = false;

export const metadata = {
  title: "Payroll — Admin Console",
  description: "Payroll cycles, employee payout profiles, and disbursement records.",
};

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const { period } = await searchParams;
  const pageData = await loadPayrollPageData(user, period, { allowSelfView: false });

  return <PayrollPageView pageData={pageData} />;
}
