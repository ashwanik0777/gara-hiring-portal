import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import {
  EmployeeDirectorySection,
  EmployeeDirectorySkeleton,
} from "@/features/employees/components/employee-directory-section";
import {
  employeeDirectoryKey,
  parseEmployeeDirectoryParams,
} from "@/features/employees/components/employee-directory-params";
import type { RawSearchParams } from "@/features/employees/components/list-search-params";

export const instant = false;

interface SubAdminEmployeesDirectoryPageProps {
  searchParams: Promise<RawSearchParams>;
}

export default async function SubAdminEmployeesDirectoryPage({
  searchParams,
}: SubAdminEmployeesDirectoryPageProps) {
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

  // Employee records open only for HR/Admin with `canEmployees` (checked above; mirrors
  // employeeService.getEmployeeDetailCore), so other roles get no dead link.
  const canOpenRecords = user.roles.includes("ADMIN") || user.roles.includes("HR");
  const params = parseEmployeeDirectoryParams(await searchParams);

  return (
    <div className="w-full space-y-6">
      <Suspense key={employeeDirectoryKey(params)} fallback={<EmployeeDirectorySkeleton />}>
        <EmployeeDirectorySection
          user={user}
          params={params}
          basePath="/subadmin/employees"
          detailHrefBase={canOpenRecords ? "/subadmin/employees" : null}
        />
      </Suspense>
    </div>
  );
}
