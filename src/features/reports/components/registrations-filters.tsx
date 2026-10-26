import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RegistrantListFilters, RegistrationFilters } from "../types";

/** URL parameters owned by the registrations tab (the dashboard and funnel use their own). */
export const REGISTRATION_PARAM_KEYS = {
  startDate: "regStart",
  endDate: "regEnd",
  interest: "regInterest",
  emailVerified: "regVerified",
  applied: "regApplied",
  search: "regQ",
  page: "regPage",
} as const;

export const REGISTRATIONS_TAB_PARAM = { name: "tab", value: "registrations" } as const;

const fieldClass =
  "h-9 w-full rounded-xl border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const labelClass = "block text-[11px] font-semibold text-muted-foreground";
const resetLinkClass =
  "inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function yesNoParam(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

/** URL parameters of the tab filters (date range and interest). */
export function registrationFilterParams(filters: RegistrationFilters): Record<string, string> {
  return {
    [REGISTRATION_PARAM_KEYS.startDate]: filters.startDate,
    [REGISTRATION_PARAM_KEYS.endDate]: filters.endDate,
    [REGISTRATION_PARAM_KEYS.interest]: filters.interest ?? "",
  };
}

/** URL parameters of the registrant list (tab filters plus verified, applied and search). */
export function registrantListParams(filters: RegistrantListFilters): Record<string, string> {
  return {
    ...registrationFilterParams(filters),
    [REGISTRATION_PARAM_KEYS.emailVerified]: yesNoParam(filters.emailVerified),
    [REGISTRATION_PARAM_KEYS.applied]: yesNoParam(filters.applied),
    [REGISTRATION_PARAM_KEYS.search]: filters.search ?? "",
  };
}

/** Link to the registrations tab with the given parameters (empty values are dropped). */
export function registrationsHref(reportsPath: string, params: Record<string, string>): string {
  const query = new URLSearchParams();
  query.set(REGISTRATIONS_TAB_PARAM.name, REGISTRATIONS_TAB_PARAM.value);
  for (const [name, value] of Object.entries(params)) {
    if (value) query.set(name, value);
  }
  return `${reportsPath}?${query.toString()}`;
}

function HiddenParams({ params }: { params: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name={REGISTRATIONS_TAB_PARAM.name} value={REGISTRATIONS_TAB_PARAM.value} />
      {Object.entries(params)
        .filter(([, value]) => value)
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
    </>
  );
}

interface RegistrationFiltersFormProps {
  reportsPath: string;
  filters: RegistrationFilters;
  /** Dashboard parameters kept when the registration filters are applied. */
  preservedParams: Record<string, string>;
  timeZoneLabel: string;
}

/**
 * Plain GET form (works without JavaScript) for the sign-up range and interest. Applying it
 * resets the registrant list to page 1; the values are validated again on the server.
 */
export function RegistrationFiltersForm({
  reportsPath,
  filters,
  preservedParams,
  timeZoneLabel,
}: RegistrationFiltersFormProps) {
  return (
    <form method="GET" action={reportsPath} className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
      <HiddenParams params={preservedParams} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div className="space-y-1">
          <label htmlFor="registrations-start" className={labelClass}>
            Signed up from
          </label>
          <input
            id="registrations-start"
            type="date"
            name={REGISTRATION_PARAM_KEYS.startDate}
            defaultValue={filters.startDate}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="registrations-end" className={labelClass}>
            Signed up until
          </label>
          <input
            id="registrations-end"
            type="date"
            name={REGISTRATION_PARAM_KEYS.endDate}
            defaultValue={filters.endDate}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="registrations-interest" className={labelClass}>
            Signed up for
          </label>
          <select
            id="registrations-interest"
            name={REGISTRATION_PARAM_KEYS.interest}
            defaultValue={filters.interest ?? ""}
            className={fieldClass}
          >
            <option value="">Everything</option>
            <option value="JOB">Job</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="BOTH">Both</option>
            <option value="NOT_CHOSEN">Not chosen</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="h-9 flex-1">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Apply
          </Button>
          <Link href={registrationsHref(reportsPath, preservedParams)} className={resetLinkClass}>
            Reset
          </Link>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Without dates the last 30 days are shown (at most 366 days at a time). Dates use the company time zone (
        {timeZoneLabel}).
      </p>
    </form>
  );
}

interface RegistrantListFiltersFormProps {
  reportsPath: string;
  filters: RegistrantListFilters;
  preservedParams: Record<string, string>;
}

/** GET form narrowing the registrant list; it keeps the tab's range and interest. */
export function RegistrantListFiltersForm({ reportsPath, filters, preservedParams }: RegistrantListFiltersFormProps) {
  const tabParams = { ...preservedParams, ...registrationFilterParams(filters) };
  return (
    <form method="GET" action={reportsPath} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <HiddenParams params={tabParams} />
      <div className="space-y-1">
        <label htmlFor="registrants-search" className={labelClass}>
          Name or e-mail
        </label>
        <input
          id="registrants-search"
          type="search"
          name={REGISTRATION_PARAM_KEYS.search}
          defaultValue={filters.search ?? ""}
          maxLength={100}
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="registrants-verified" className={labelClass}>
          E-mail verification
        </label>
        <select
          id="registrants-verified"
          name={REGISTRATION_PARAM_KEYS.emailVerified}
          defaultValue={yesNoParam(filters.emailVerified)}
          className={fieldClass}
        >
          <option value="">Everyone</option>
          <option value="yes">Verified</option>
          <option value="no">Not verified</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="registrants-applied" className={labelClass}>
          Applications
        </label>
        <select
          id="registrants-applied"
          name={REGISTRATION_PARAM_KEYS.applied}
          defaultValue={yesNoParam(filters.applied)}
          className={fieldClass}
        >
          <option value="">Everyone</option>
          <option value="yes">Applied</option>
          <option value="no">Not applied yet</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-9 flex-1">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Search
        </Button>
        <Link href={registrationsHref(reportsPath, tabParams)} className={resetLinkClass}>
          Clear
        </Link>
      </div>
    </form>
  );
}
