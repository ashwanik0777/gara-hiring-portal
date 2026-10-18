import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@/types/enums";
import { payrollService } from "@/features/payroll/services/payroll-service";
import { PayrollManagementClient } from "@/features/payroll/components/payroll-management-client";

export const instant = false;

export const metadata = {
  title: "Payroll & Compensation Management — Admin Console",
  description: "Manage monthly payroll cycles, employee banking, and disbursement verifications.",
};

export default async function AdminPayrollPage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }

  const dashboardData = await payrollService.getPayrollDashboardData(user);

  return (
    <div className="w-full">
      <PayrollManagementClient
        initialData={dashboardData}
        currentUserId={user.id}
        portalRole="ADMIN"
      />
    </div>
  );
}
