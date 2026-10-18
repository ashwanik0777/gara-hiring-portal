import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { payrollService } from "@/features/payroll/services/payroll-service";
import { PayrollManagementClient } from "@/features/payroll/components/payroll-management-client";

export const instant = false;

export const metadata = {
  title: "Payroll & Compensation Management — HRMS Console",
  description: "Manage monthly payroll cycles, employee banking, and disbursement verifications.",
};

export default async function PayrollModulePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const hasAccess = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasAccess) {
    redirect("/candidate/dashboard");
  }

  const dashboardData = await payrollService.getPayrollDashboardData(user);

  return (
    <div className="w-full">
      <PayrollManagementClient
        initialData={dashboardData}
        currentUserId={user.id}
        portalRole="HRMS"
      />
    </div>
  );
}
