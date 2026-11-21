import React from "react";
import Link from "next/link";
import { ArrowRight, Building2, GraduationCap, Hourglass, Search, UserCheck, Users } from "lucide-react";
import { EmployeeStatus, EmploymentType } from "@/types/enums";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { fieldInputClass, fieldOkBorder } from "@/components/ui/form-field";
import { formatBatchDay } from "@/features/training/components/batch-dates";
import type { EmployeeDirectoryPage, EmployeeDirectorySummary, PublicEmployeeDirectoryItem } from "../types";
import { EmploymentTypeBadge } from "./employment-type-badge";
import { FilterChipLink } from "./filter-chip-link";
import { ListPagination } from "./list-pagination";
import { AutoSubmitSelect } from "./auto-submit-select";
import {
  EMPLOYMENT_TYPE_PARAM,
  employeeDirectoryHref,
  hasDirectoryFilters,
  type EmployeeDirectoryParams,
} from "./employee-directory-params";

interface EmployeeDirectoryTableProps {
  result: EmployeeDirectoryPage;
  /** Totals for the summary cards and chip counts; null when they could not be loaded. */
  summary?: EmployeeDirectorySummary | null;
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

const STATUS_ORDER: EmployeeStatus[] = [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION, EmployeeStatus.ON_LEAVE, EmployeeStatus.EXITED];

export const EMPLOYEE_STATUS_META: Record<EmployeeStatus, { label: string; variant: "success" | "warning" | "secondary" | "destructive" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  PROBATION: { label: "Probation", variant: "warning" },
  ON_LEAVE: { label: "On Leave", variant: "secondary" },
  EXITED: { label: "Exited", variant: "destructive" },
};

const TYPE_OPTIONS: Array<{ type: EmploymentType | null; label: string }> = [
  { type: null, label: "All types" },
  { type: EmploymentType.FULL_TIME, label: "Full-time" },
  { type: EmploymentType.INTERN, label: "Interns" },
];

/** Each row is its own grid, so every column is fr or fixed (never auto) to line up across rows. */
const ROW_COLUMNS = "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_12rem]";

/** "Test Engineering Lead" → "TL". */
export function employeeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function EmployeeRow({ employee, detailHref }: { employee: PublicEmployeeDirectoryItem; detailHref: string | null }) {
  const status = EMPLOYEE_STATUS_META[employee.status];
  return (
    <li className={cn("grid grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5 lg:items-center lg:gap-4", ROW_COLUMNS)}>
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            employee.status === EmployeeStatus.EXITED ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
          )}
        >
          {employeeInitials(employee.name)}
        </span>
        <div className="min-w-0">
          {detailHref ? (
            <Link
              href={detailHref}
              className="block truncate rounded-sm text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {employee.name}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">{employee.email}</p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{employee.designation}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{employee.department}</span>
        </p>
      </div>

      <div className="min-w-0">
        {employee.manager ? (
          <>
            <p className="truncate text-sm text-foreground">
              <span className="text-muted-foreground lg:hidden">Reports to </span>
              {employee.manager.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{employee.manager.designation}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No manager</p>
        )}
      </div>

      <div className="min-w-0">
        <p className="w-fit rounded-md bg-muted/70 px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">{employee.employeeCode}</p>
        <p className="mt-1 text-xs text-muted-foreground">Joined {formatBatchDay(new Date(employee.joiningDate))}</p>
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <Badge variant={status.variant} className="whitespace-nowrap text-[10px]">
          {status.label}
        </Badge>
        <EmploymentTypeBadge employmentType={employee.employmentType} />
        {detailHref && (
          // The name is the link for keyboards and screen readers; this is a larger click target.
          <Link
            href={detailHref}
            tabIndex={-1}
            aria-hidden="true"
            className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:ml-1"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Employee directory: summary cards, status and type filters, a GET search form and one
 * database page of employees, all rendered on the server. Filters and the page live in the URL.
 */
export function EmployeeDirectoryTable({ result, summary = null, params, basePath, detailHrefBase = "/admin/employees" }: EmployeeDirectoryTableProps) {
  const filtersActive = hasDirectoryFilters(params);
  // A department from the URL that no longer exists still needs to be selectable, so the
  // control reflects the filter that produced the rows.
  const departments =
    params.department && !result.departments.includes(params.department)
      ? [...result.departments, params.department].sort()
      : result.departments;
  const href = (overrides: Partial<EmployeeDirectoryParams>) => employeeDirectoryHref(basePath, params, { page: 1, ...overrides });
  const pageHref = (page: number) => employeeDirectoryHref(basePath, params, { page });
  const only = (overrides: Partial<EmployeeDirectoryParams>) =>
    employeeDirectoryHref(basePath, { q: "", department: "", status: null, type: null, page: 1 }, overrides);

  return (
    <div className="space-y-6">
      {summary && (
        <StatGrid columns={4} label="Employee summary">
          <StatCard label="All Employees" value={summary.total} icon={Users} tone="blue" href={basePath} />
          <StatCard label="Active" value={summary.byStatus.ACTIVE} icon={UserCheck} tone="emerald" href={only({ status: EmployeeStatus.ACTIVE })} />
          <StatCard label="On Probation" value={summary.byStatus.PROBATION} icon={Hourglass} tone="amber" href={only({ status: EmployeeStatus.PROBATION })} />
          <StatCard label="Interns" value={summary.byType.INTERN} icon={GraduationCap} tone="violet" href={only({ type: EmploymentType.INTERN })} />
        </StatGrid>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
          <FilterChipLink href={href({ status: null })} active={!params.status} label="All" count={summary?.total} />
          {STATUS_ORDER.map((status) => (
            <FilterChipLink
              key={status}
              href={href({ status })}
              active={params.status === status}
              label={EMPLOYEE_STATUS_META[status].label}
              count={summary?.byStatus[status]}
            />
          ))}
        </nav>
        <nav aria-label="Filter by employment type" className="inline-flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {TYPE_OPTIONS.map((option) => {
            const active = params.type === option.type;
            return (
              <Link
                key={option.label}
                href={href({ type: option.type })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
                {summary && option.type && <span className="ml-1.5 tabular-nums text-muted-foreground">{summary.byType[option.type]}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <form method="get" action={basePath} role="search" aria-label="Search the employee directory" className="flex flex-col gap-3 md:flex-row md:items-center">
        {params.status && <input type="hidden" name="status" value={params.status} />}
        {params.type && <input type="hidden" name="type" value={EMPLOYMENT_TYPE_PARAM[params.type]} />}
        <div className="relative w-full md:max-w-md">
          <label htmlFor={DIRECTORY_FIELD_IDS.search} className="sr-only">
            Search employees
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={DIRECTORY_FIELD_IDS.search}
            name="q"
            type="search"
            defaultValue={params.q}
            maxLength={100}
            placeholder="Search name, code, designation or email"
            className={cn(fieldInputClass, fieldOkBorder, "pl-10")}
          />
        </div>
        <div className="w-full md:w-60">
          <label htmlFor={DIRECTORY_FIELD_IDS.department} className="sr-only">
            Department
          </label>
          <AutoSubmitSelect id={DIRECTORY_FIELD_IDS.department} name="department" defaultValue={params.department} className={cn(fieldInputClass, fieldOkBorder, "cursor-pointer")}>
            <option value="">All departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <button type="submit" className="sr-only">
          Search
        </button>
        {filtersActive && (
          <Link href={basePath} className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:ml-1">
            Clear filters
          </Link>
        )}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title={result.total === 0 && !filtersActive ? "No employees yet" : result.total === 0 ? "No employee matches these filters" : "No employees on this page"}
          action={
            result.total > 0 ? (
              <Link href={pageHref(1)} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                Go to the first page
              </Link>
            ) : filtersActive ? (
              <Link href={basePath} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div
            aria-hidden="true"
            className={cn("hidden gap-4 border-b border-border/70 bg-muted/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid", ROW_COLUMNS)}
          >
            <span>Employee</span>
            <span>Role</span>
            <span>Manager</span>
            <span>Code</span>
            <span className="text-right">Status</span>
          </div>
          <ul aria-label="Employees" className="divide-y divide-border/60">
            {result.items.map((employee) => (
              <EmployeeRow key={employee.id} employee={employee} detailHref={detailHrefBase ? `${detailHrefBase}/${employee.id}` : null} />
            ))}
          </ul>
          <ListPagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
            hrefFor={pageHref}
            label="Employee directory pages"
            itemNoun="employees"
            className="border-t border-border/60 px-5 py-3"
          />
        </div>
      )}
    </div>
  );
}
