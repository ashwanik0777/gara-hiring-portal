import React from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { employeeService } from "@/features/employees/services/employee-service";
import type { EmployeeDetailCore } from "@/features/employees/types";
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
  let employee: EmployeeDetailCore;
  try {
    // The service allows HR/Admin with canEmployees, or the employee themselves. Only the core
    // record is awaited here; documents, periods and history stream inside the view.
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

  return (
    <EmployeeDetailView
      employee={employee}
      user={user}
      isStaffAdmin={isStaffAdmin}
      isSelf={isSelf}
      openExitTab={tab === "exit"}
      applicationHrefBase="/admin/applications"
    />
  );
}
