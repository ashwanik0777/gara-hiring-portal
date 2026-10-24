import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { employeeService } from "@/features/employees/services/employee-service";
import { EmployeeDirectoryTable } from "@/features/employees/components/employee-directory-table";

export const instant = false;

export default async function SubAdminEmployeesDirectoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/employees");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) {
    redirect("/candidate/dashboard");
  }

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canEmployees) {
    redirect("/subadmin");
  }

  const employees = await employeeService.getEmployeeDirectory(user);
  const departments = Array.from(new Set(employees.map((e) => e.department))).sort();
  // Employee records open only for HR/Admin with `canEmployees` (checked above; mirrors
  // employeeService.getEmployeeDetail), so other roles get no dead link.
  const canOpenRecords = user.roles.includes("ADMIN") || user.roles.includes("HR");

  return (
    <div className="w-full space-y-6">
      {/* Directory Table */}
      <EmployeeDirectoryTable
        employees={employees}
        departments={departments}
        detailHrefBase={canOpenRecords ? "/subadmin/employees" : null}
      />
    </div>
  );
}
