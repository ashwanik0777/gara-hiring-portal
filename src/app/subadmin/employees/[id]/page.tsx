import React from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { employeeService } from "@/features/employees/services/employee-service";
import { EmployeeDetailView } from "@/features/employees/components/employee-detail-view";

interface SubAdminEmployeeDetailPageProps {
  params: Promise<{ id: string }>;
}

export const instant = false;

export default async function SubAdminEmployeeDetailPage({
  params,
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
  let employee;
  try {
    employee = await employeeService.getEmployeeDetail(user, id);
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
  const allStaff = isStaffAdmin ? await employeeService.getEmployeeDirectory(user) : [];
  const isSelf = employee.email === user.email;
  // The originating application opens in the sub-admin workspace, which enforces its own
  // `canApplications` guard.
  const canOpenApplications = await hasPermission(user, "canApplications");

  return (
    <EmployeeDetailView
      employee={employee}
      isStaffAdmin={isStaffAdmin}
      isSelf={isSelf}
      allStaff={allStaff.map((s) => ({ id: s.id, employeeCode: s.employeeCode, name: s.name }))}
      applicationHrefBase={canOpenApplications ? "/subadmin/applications" : null}
    />
  );
}
