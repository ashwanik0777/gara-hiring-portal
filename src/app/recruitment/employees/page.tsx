import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { employeeService } from "@/features/employees/services/employee-service";
import { EmployeeDirectoryTable } from "@/features/employees/components/employee-directory-table";

export const instant = false;

export default async function RecruitmentEmployeesDirectoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const employees = await employeeService.getEmployeeDirectory(user);
  const departments = Array.from(new Set(employees.map((e) => e.department))).sort();

  return (
    <div className="w-full space-y-6">
      {/* Directory Table */}
      <EmployeeDirectoryTable employees={employees} departments={departments} />
    </div>
  );
}
