import React from "react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, toActionError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { TableSkeleton, ToolbarSkeleton } from "@/components/feedback/page-skeletons";
import { employeeService } from "../services/employee-service";
import type { EmployeeDirectoryPage } from "../types";
import { EmployeeDirectoryTable } from "./employee-directory-table";
import { SectionUnavailable } from "./section-unavailable";
import { toDirectoryQuery, type EmployeeDirectoryParams } from "./employee-directory-params";

interface EmployeeDirectorySectionProps {
  user: AuthenticatedUser;
  params: EmployeeDirectoryParams;
  basePath: string;
  detailHrefBase: string | null;
}

/**
 * Streamed body of the directory pages: loads one database page and renders it. The page
 * authorizes the viewer first; the service re-checks `canEmployees`.
 */
export async function EmployeeDirectorySection({
  user,
  params,
  basePath,
  detailHrefBase,
}: EmployeeDirectorySectionProps) {
  let result: EmployeeDirectoryPage;
  try {
    result = await employeeService.getEmployeeDirectory(user, toDirectoryQuery(params));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <UnauthorizedState message="Viewing the employee directory requires the employees permission." />
      );
    }
    return (
      <SectionUnavailable
        title="Employee directory"
        message={toActionError(error, "The directory could not be loaded right now. Please try again.")}
      />
    );
  }

  return (
    <EmployeeDirectoryTable
      result={result}
      params={params}
      basePath={basePath}
      detailHrefBase={detailHrefBase}
    />
  );
}

/** Mirrors the directory: filter toolbar and a seven-column table. */
export function EmployeeDirectorySkeleton({ label = "Loading employees" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <ToolbarSkeleton />
      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
