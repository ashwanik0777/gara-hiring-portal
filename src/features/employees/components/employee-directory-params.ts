import { EmployeeStatus } from "@/types/enums";
import type { EmployeeDirectoryQuery } from "../types";
import { buildListHref, firstParam, parsePositivePage, type RawSearchParams } from "./list-search-params";

/** Directory filters as they travel in the URL: `?q=&department=&status=&page=`. */
export interface EmployeeDirectoryParams {
  q: string;
  department: string;
  status: EmployeeStatus | null;
  page: number;
}

const STATUS_VALUES = new Set<string>(Object.values(EmployeeStatus));
const MAX_QUERY_LENGTH = 100;

export function parseEmployeeDirectoryParams(raw: RawSearchParams): EmployeeDirectoryParams {
  const status = firstParam(raw.status);
  return {
    q: firstParam(raw.q).trim().slice(0, MAX_QUERY_LENGTH),
    department: firstParam(raw.department).trim().slice(0, MAX_QUERY_LENGTH),
    status: STATUS_VALUES.has(status) ? (status as EmployeeStatus) : null,
    page: parsePositivePage(raw.page),
  };
}

export function hasDirectoryFilters(params: EmployeeDirectoryParams): boolean {
  return Boolean(params.q || params.department || params.status);
}

/** Service query for the parsed params (empty filters are omitted). */
export function toDirectoryQuery(params: EmployeeDirectoryParams): EmployeeDirectoryQuery {
  return {
    search: params.q || undefined,
    department: params.department || undefined,
    status: params.status ?? undefined,
    page: params.page,
  };
}

/** Link that keeps the current filters; page 1 is left out so the base URL stays canonical. */
export function employeeDirectoryHref(
  basePath: string,
  params: EmployeeDirectoryParams,
  overrides: Partial<EmployeeDirectoryParams> = {}
): string {
  const next = { ...params, ...overrides };
  return buildListHref(basePath, {
    q: next.q,
    department: next.department,
    status: next.status,
    page: next.page > 1 ? next.page : null,
  });
}

/** Suspense key: a new filter or page shows the skeleton instead of stale rows. */
export function employeeDirectoryKey(params: EmployeeDirectoryParams): string {
  return [params.q, params.department, params.status ?? "", params.page].join("|");
}
