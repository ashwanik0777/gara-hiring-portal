import React from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { employeeService } from "@/features/employees/services/employee-service";
import { EmployeeDetailView } from "@/features/employees/components/employee-detail-view";

interface EmployeeDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

export const instant = false;

export default async function EmployeeDetailPage({ params, searchParams }: EmployeeDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const { id } = await params;
  const { tab } = await searchParams;
  let employee;
  try {
    // The service allows HR/Admin with canEmployees, or the employee themselves.
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

  return (
    <EmployeeDetailView
      employee={employee}
      isStaffAdmin={isStaffAdmin}
      isSelf={isSelf}
      allStaff={allStaff.map((s) => ({ id: s.id, employeeCode: s.employeeCode, name: s.name }))}
      openExitTab={tab === "exit"}
      applicationHrefBase="/admin/applications"
    />
  );
}
