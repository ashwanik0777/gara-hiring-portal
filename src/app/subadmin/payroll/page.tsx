import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { payrollService } from "@/features/payroll/services/payroll-service";
import { PayrollManagementClient } from "@/features/payroll/components/payroll-management-client";

export const instant = false;

export const metadata = {
  title: "Payroll Management — SubAdmin Console",
  description: "View payroll cycles, track employee disbursements, and verify payout records.",
};

export default async function SubAdminPayrollPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/payroll");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canPayroll) redirect("/subadmin");

  const dashboardData = await payrollService.getPayrollDashboardData(user);

  return (
    <div className="w-full">
      <PayrollManagementClient
        initialData={dashboardData}
        currentUserId={user.id}
        portalRole="SUBADMIN"
      />
    </div>
  );
}
