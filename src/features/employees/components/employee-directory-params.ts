import { EmployeeStatus, EmploymentType } from "@/types/enums";
import type { EmployeeDirectoryQuery } from "../types";
import { buildListHref, firstParam, parsePositivePage, type RawSearchParams } from "./list-search-params";

/** Directory filters as they travel in the URL: `?q=&department=&status=&type=&page=`. */
export interface EmployeeDirectoryParams {
  q: string;
  department: string;
  status: EmployeeStatus | null;
  type: EmploymentType | null;
  page: number;
}

const STATUS_VALUES = new Set<string>(Object.values(EmployeeStatus));
const MAX_QUERY_LENGTH = 100;

/** URL words for the employment type filter. */
export const EMPLOYMENT_TYPE_PARAM: Record<EmploymentType, string> = {
  FULL_TIME: "full-time",
  INTERN: "intern",
};
const TYPE_BY_PARAM = new Map<string, EmploymentType>(
  (Object.entries(EMPLOYMENT_TYPE_PARAM) as Array<[EmploymentType, string]>).map(([type, word]) => [word, type])
);

export function parseEmployeeDirectoryParams(raw: RawSearchParams): EmployeeDirectoryParams {
  const status = firstParam(raw.status);
  return {
    q: firstParam(raw.q).trim().slice(0, MAX_QUERY_LENGTH),
    department: firstParam(raw.department).trim().slice(0, MAX_QUERY_LENGTH),
    status: STATUS_VALUES.has(status) ? (status as EmployeeStatus) : null,
    type: TYPE_BY_PARAM.get(firstParam(raw.type)) ?? null,
    page: parsePositivePage(raw.page),
  };
}

export function hasDirectoryFilters(params: EmployeeDirectoryParams): boolean {
  return Boolean(params.q || params.department || params.status || params.type);
}

/** Service query for the parsed params (empty filters are omitted). */
export function toDirectoryQuery(params: EmployeeDirectoryParams): EmployeeDirectoryQuery {
  return {
    search: params.q || undefined,
    department: params.department || undefined,
    status: params.status ?? undefined,
    employmentType: params.type ?? undefined,
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
    type: next.type ? EMPLOYMENT_TYPE_PARAM[next.type] : null,
    page: next.page > 1 ? next.page : null,
  });
}

/** Suspense key: a new filter or page shows the skeleton instead of stale rows. */
export function employeeDirectoryKey(params: EmployeeDirectoryParams): string {
  return [params.q, params.department, params.status ?? "", params.type ?? "", params.page].join("|");
}
