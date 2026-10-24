import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { employeeService } from "@/features/employees/services/employee-service";
import { EmployeeDirectoryTable } from "@/features/employees/components/employee-directory-table";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";

export const instant = false;

export default async function RecruitmentEmployeesDirectoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level authorization (layouts are not a security boundary); the service re-checks.
  if (!(await hasPermission(user, "canEmployees"))) {
    return (
      <UnauthorizedState message="Viewing the employee directory requires the employees permission." />
    );
  }

  const employees = await employeeService.getEmployeeDirectory(user);
  const departments = Array.from(new Set(employees.map((e) => e.department))).sort();

  return (
    <div className="w-full space-y-6">
      {/* Directory Table */}
      <EmployeeDirectoryTable
        employees={employees}
        departments={departments}
        detailHrefBase="/admin/employees"
      />
    </div>
  );
}
