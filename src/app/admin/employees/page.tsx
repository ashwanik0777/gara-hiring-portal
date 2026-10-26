import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
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

interface EmployeesDirectoryPageProps {
  searchParams: Promise<RawSearchParams>;
}

export default async function RecruitmentEmployeesDirectoryPage({ searchParams }: EmployeesDirectoryPageProps) {
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

  // Filters and page travel in the URL so the back button and shared links reproduce the view.
  const params = parseEmployeeDirectoryParams(await searchParams);

  return (
    <div className="w-full space-y-6">
      <Suspense key={employeeDirectoryKey(params)} fallback={<EmployeeDirectorySkeleton />}>
        <EmployeeDirectorySection
          user={user}
          params={params}
          basePath="/admin/employees"
          detailHrefBase="/admin/employees"
        />
      </Suspense>
    </div>
  );
}
