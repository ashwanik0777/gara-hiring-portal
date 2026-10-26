import React from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { employeeService } from "@/features/employees/services/employee-service";
import type { EmployeeDetailCore } from "@/features/employees/types";
import { EmployeeDetailView } from "@/features/employees/components/employee-detail-view";

interface SubAdminEmployeeDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

export const instant = false;

export default async function SubAdminEmployeeDetailPage({
  params,
  searchParams,
}: SubAdminEmployeeDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/employees");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level authorization (layouts are not a security boundary); the service re-checks
  // and only lets HR/Admin with `canEmployees` (or the employee themselves) read the record.
  if (!user.roles.some((r) => STAFF_ROLES.includes(r))) {
    redirect("/candidate/dashboard");
  }
  if (!(await hasPermission(user, "canEmployees"))) {
    return (
      <UnauthorizedState message="Viewing employee records requires the employees permission." />
    );
  }

  const { id } = await params;
  const { tab } = await searchParams;
  let employee: EmployeeDetailCore;
  try {
    // Only the core record is awaited here; documents, periods and history stream in the view.
    employee = await employeeService.getEmployeeDetailCore(user, id);
  } catch (err: unknown) {
    if (err instanceof ForbiddenError) {
      return <UnauthorizedState message="You are not authorized to view this employee record." />;
    }
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  const isStaffAdmin =
    (user.roles.includes("ADMIN") || user.roles.includes("HR")) &&
    (await hasPermission(user, "canEmployees"));
  const isSelf = employee.email === user.email;
  // The originating application opens in the sub-admin workspace, which enforces its own
  // `canApplications` guard.
  const canOpenApplications = await hasPermission(user, "canApplications");

  return (
    <EmployeeDetailView
      employee={employee}
      user={user}
      isStaffAdmin={isStaffAdmin}
      isSelf={isSelf}
      openExitTab={tab === "exit"}
      applicationHrefBase={canOpenApplications ? "/subadmin/applications" : null}
    />
  );
}
