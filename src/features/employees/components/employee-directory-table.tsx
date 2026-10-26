import React from "react";
import Link from "next/link";
import { ArrowRight, Building, Filter, Search, Users } from "lucide-react";
import { EmployeeStatus } from "@/types/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmployeeDirectoryPage } from "../types";
import { EmploymentTypeBadge } from "./employment-type-badge";
import { ListPagination } from "./list-pagination";
import {
  employeeDirectoryHref,
  hasDirectoryFilters,
  type EmployeeDirectoryParams,
} from "./employee-directory-params";

interface EmployeeDirectoryTableProps {
  result: EmployeeDirectoryPage;
  params: EmployeeDirectoryParams;
  /** Directory route of this portal; the filter form submits to it and page links keep it. */
  basePath: string;
  /**
   * Portal route that opens an employee record (`/admin/employees` or `/subadmin/employees`),
   * or null when the viewer may not open employee records.
   */
  detailHrefBase?: string | null;
}

/** Stable control ids (labels reference them; tests and automation rely on them). */
export const DIRECTORY_FIELD_IDS = {
  search: "employee-directory-search",
  department: "employee-directory-department",
  status: "employee-directory-status",
} as const;

const STATUS_OPTIONS: Array<{ value: EmployeeStatus; label: string }> = [
  { value: EmployeeStatus.PROBATION, label: "Probation" },
  { value: EmployeeStatus.ACTIVE, label: "Active" },
  { value: EmployeeStatus.ON_LEAVE, label: "On Leave" },
  { value: EmployeeStatus.EXITED, label: "Exited" },
];

const selectClass =
  "h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function getStatusBadge(status: EmployeeStatus) {
  switch (status) {
    case EmployeeStatus.PROBATION:
      return <Badge variant="warning">Probation</Badge>;
    case EmployeeStatus.ACTIVE:
      return <Badge variant="success">Active</Badge>;
    case EmployeeStatus.ON_LEAVE:
      return <Badge variant="secondary">On Leave</Badge>;
    case EmployeeStatus.EXITED:
      return <Badge variant="destructive">Exited</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * Employee directory: a plain GET filter form plus one database page of rows, all rendered on
 * the server (no client state). Filters and the page live in the URL.
 */
export function EmployeeDirectoryTable({
  result,
  params,
  basePath,
  detailHrefBase = "/admin/employees",
}: EmployeeDirectoryTableProps) {
  const filtersActive = hasDirectoryFilters(params);
  // A department from the URL that no longer exists still needs to be selectable, so the
  // control reflects the filter that produced the rows.
  const departments =
    params.department && !result.departments.includes(params.department)
      ? [...result.departments, params.department].sort()
      : result.departments;
  const pageHref = (page: number) => employeeDirectoryHref(basePath, params, { page });

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-xs">
        <CardContent className="pt-6">
          <form
            method="get"
            action={basePath}
            role="search"
            aria-label="Filter the employee directory"
            className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
          >
            <div className="relative w-full md:w-96">
              <label htmlFor={DIRECTORY_FIELD_IDS.search} className="sr-only">
                Search employees
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id={DIRECTORY_FIELD_IDS.search}
                name="q"
                type="search"
                defaultValue={params.q}
                maxLength={100}
                placeholder="Search by name, code, designation, or email..."
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex w-full flex-wrap items-end gap-3 md:w-auto">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={DIRECTORY_FIELD_IDS.department}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Department
                </label>
                <select
                  id={DIRECTORY_FIELD_IDS.department}
                  name="department"
                  defaultValue={params.department}
                  className={selectClass}
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={DIRECTORY_FIELD_IDS.status} className="text-xs text-muted-foreground">
                  Status
                </label>
                <select
                  id={DIRECTORY_FIELD_IDS.status}
                  name="status"
                  defaultValue={params.status ?? ""}
                  className={selectClass}
                >
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" variant="outline">
                  Apply filters
                </Button>
                {filtersActive && (
                  <Link
                    href={basePath}
                    className="rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear
                  </Link>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border shadow-xs">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" /> Employee Directory ({result.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">Employee</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Department</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Designation</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Manager</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-xs">
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      {result.total === 0 && !filtersActive ? (
                        "No employee records yet. Records are created when HR marks a person as joined."
                      ) : result.total === 0 ? (
                        <>
                          No employees match these filters.{" "}
                          <Link href={basePath} className="font-medium text-primary underline-offset-4 hover:underline">
                            Clear filters
                          </Link>
                        </>
                      ) : (
                        <>
                          No employees on this page.{" "}
                          <Link
                            href={pageHref(1)}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Go to the first page
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  result.items.map((emp) => (
                    <tr key={emp.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            aria-hidden="true"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary"
                          >
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{emp.name}</div>
                            <div className="text-[11px] text-muted-foreground">{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono font-medium text-foreground">{emp.employeeCode}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Building className="h-3 w-3 text-muted-foreground/70" aria-hidden="true" />
                          {emp.department}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-foreground">{emp.designation}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {emp.manager ? (
                          <div>
                            <span className="font-medium text-foreground">{emp.manager.name}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {emp.manager.designation}
                            </span>
                          </div>
                        ) : (
                          <span className="italic text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getStatusBadge(emp.status)}
                          <EmploymentTypeBadge employmentType={emp.employmentType} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {detailHrefBase && (
                          <Link
                            href={`${detailHrefBase}/${emp.id}`}
                            className="inline-flex h-7 items-center gap-1 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            View Cockpit <ArrowRight className="h-3 w-3" aria-hidden="true" />
                            <span className="sr-only"> for {emp.name}</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
            hrefFor={pageHref}
            label="Employee directory pages"
            itemNoun="employees"
            className="border-t border-border/50 px-4 py-3"
          />
        </CardContent>
      </Card>
    </div>
  );
}
