import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { PayrollPageSection } from "@/features/payroll/components/payroll-page-section";
import { PayrollPageSkeleton } from "@/features/payroll/components/payroll-page-skeleton";
import type { RawSearchParams } from "@/features/payroll/services/payroll-page-data";

export const instant = false;

export const metadata = {
  title: "Payroll — Admin Console",
  description: "Payroll cycles, employee payout profiles, and disbursement records.",
};

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  return (
    <Suspense fallback={<PayrollPageSkeleton />}>
      <PayrollPageSection user={user} searchParams={searchParams} allowSelfView={false} basePath="/admin/payroll" />
    </Suspense>
  );
}
