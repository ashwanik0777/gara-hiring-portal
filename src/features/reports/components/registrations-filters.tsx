import Link from "next/link";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RegistrantListFilters, RegistrationFilters } from "../types";
import {
  ReportToolbarLabel,
  reportFieldClass,
  reportFieldLabelClass,
  reportSecondaryLinkClass,
  reportToolbarClass,
  reportToolbarNoteClass,
} from "./report-toolbar";

/** URL parameters owned by the registrations tab of the reports page. */
export const REGISTRATION_PARAM_KEYS = {
  startDate: "regStart",
  endDate: "regEnd",
  interest: "regInterest",
} as const;

export const REGISTRATIONS_TAB_PARAM = { name: "tab", value: "registrations" } as const;

/** URL parameters of the registrant list on the Registrations page. */
export const REGISTRANT_DIRECTORY_PARAM_KEYS = {
  startDate: "from",
  endDate: "to",
  interest: "interest",
  emailVerified: "verified",
  applied: "applied",
  search: "q",
  page: "page",
} as const;

function yesNoParam(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
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

/** URL parameters of the registrant list for validated filters (page excluded). */
export function registrantDirectoryParams(filters: RegistrantListFilters): Record<string, string> {
  return {
    [REGISTRANT_DIRECTORY_PARAM_KEYS.search]: filters.search ?? "",
    [REGISTRANT_DIRECTORY_PARAM_KEYS.interest]: filters.interest ?? "",
    [REGISTRANT_DIRECTORY_PARAM_KEYS.emailVerified]: yesNoParam(filters.emailVerified),
    [REGISTRANT_DIRECTORY_PARAM_KEYS.applied]: yesNoParam(filters.applied),
    [REGISTRANT_DIRECTORY_PARAM_KEYS.startDate]: filters.startDate ?? "",
    [REGISTRANT_DIRECTORY_PARAM_KEYS.endDate]: filters.endDate ?? "",
  };
}

/** Link to the Registrations page with the given parameters (empty values are dropped). */
export function registrantDirectoryHref(listPath: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value) query.set(name, value);
  }
  const search = query.toString();
  return search ? `${listPath}?${search}` : listPath;
}

function HiddenParams({ params }: { params: Record<string, string> }) {
  return (
    <>
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
 * Plain GET form (works without JavaScript) for the sign-up range and interest of the
 * registrations tab; the values are validated again on the server.
 */
export function RegistrationFiltersForm({
  reportsPath,
  filters,
  preservedParams,
  timeZoneLabel,
}: RegistrationFiltersFormProps) {
  return (
    <form method="GET" action={reportsPath} aria-labelledby="registrations-filters-label" className={reportToolbarClass}>
      <input type="hidden" name={REGISTRATIONS_TAB_PARAM.name} value={REGISTRATIONS_TAB_PARAM.value} />
      <HiddenParams params={preservedParams} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <ReportToolbarLabel id="registrations-filters-label" icon={SlidersHorizontal} className="lg:mb-2.5 lg:w-20">
          Filters
        </ReportToolbarLabel>
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
          <div className="space-y-1">
            <label htmlFor="registrations-start" className={reportFieldLabelClass}>
              Signed up from
            </label>
            <input
              id="registrations-start"
              type="date"
              name={REGISTRATION_PARAM_KEYS.startDate}
              defaultValue={filters.startDate}
              className={reportFieldClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="registrations-end" className={reportFieldLabelClass}>
              Signed up until
            </label>
            <input
              id="registrations-end"
              type="date"
              name={REGISTRATION_PARAM_KEYS.endDate}
              defaultValue={filters.endDate}
              className={reportFieldClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="registrations-interest" className={reportFieldLabelClass}>
              Signed up for
            </label>
            <select
              id="registrations-interest"
              name={REGISTRATION_PARAM_KEYS.interest}
              defaultValue={filters.interest ?? ""}
              className={reportFieldClass}
            >
              <option value="">Everything</option>
              <option value="JOB">Job</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="BOTH">Both</option>
              <option value="NOT_CHOSEN">Not chosen</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 lg:shrink-0">
          <Button type="submit" size="sm" className="h-9 flex-1 rounded-xl lg:flex-none">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Apply
          </Button>
          <Link href={registrationsHref(reportsPath, preservedParams)} className={reportSecondaryLinkClass}>
            Reset
          </Link>
        </div>
      </div>
      <p className={reportToolbarNoteClass}>
        Without dates the last 30 days are shown (at most 366 days at a time). Dates use the company time zone (
        {timeZoneLabel}).
      </p>
    </form>
  );
}

/** Raw (unvalidated) URL values shown back in the Registrations page filter form. */
export interface RegistrantDirectoryFormValues {
  search: string;
  interest: string;
  emailVerified: string;
  applied: string;
  startDate: string;
  endDate: string;
}

/**
 * GET form of the Registrations page: search, interest, verification, applications and an
 * optional sign-up range. It renders the submitted values as typed (the server validates
 * them), so it can paint before the list has loaded; applying it returns to page 1.
 */
export function RegistrantDirectoryFiltersForm({
  listPath,
  values,
  timeZoneLabel,
}: {
  listPath: string;
  values: RegistrantDirectoryFormValues;
  timeZoneLabel: string;
}) {
  const keys = REGISTRANT_DIRECTORY_PARAM_KEYS;
  return (
    <form method="GET" action={listPath} aria-labelledby="registrant-filters-label" className={reportToolbarClass}>
      <ReportToolbarLabel id="registrant-filters-label" icon={SlidersHorizontal} className="mb-3">
        Filters
      </ReportToolbarLabel>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="registrants-search" className={reportFieldLabelClass}>
            Name or e-mail
          </label>
          <input
            id="registrants-search"
            type="search"
            name={keys.search}
            defaultValue={values.search}
            maxLength={100}
            autoComplete="off"
            className={reportFieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="registrants-interest" className={reportFieldLabelClass}>
            Signed up for
          </label>
          <select id="registrants-interest" name={keys.interest} defaultValue={values.interest} className={reportFieldClass}>
            <option value="">Everything</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="JOB">Job</option>
            <option value="BOTH">Both</option>
            <option value="NOT_CHOSEN">Not chosen</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="registrants-verified" className={reportFieldLabelClass}>
            E-mail verification
          </label>
          <select
            id="registrants-verified"
            name={keys.emailVerified}
            defaultValue={values.emailVerified}
            className={reportFieldClass}
          >
            <option value="">Everyone</option>
            <option value="yes">Verified</option>
            <option value="no">Not verified</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="registrants-applied" className={reportFieldLabelClass}>
            Applications
          </label>
          <select id="registrants-applied" name={keys.applied} defaultValue={values.applied} className={reportFieldClass}>
            <option value="">Everyone</option>
            <option value="yes">Applied</option>
            <option value="no">Not applied yet</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="registrants-from" className={reportFieldLabelClass}>
            Signed up from
          </label>
          <input
            id="registrants-from"
            type="date"
            name={keys.startDate}
            defaultValue={values.startDate}
            className={reportFieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="registrants-to" className={reportFieldLabelClass}>
            Signed up until
          </label>
          <input
            id="registrants-to"
            type="date"
            name={keys.endDate}
            defaultValue={values.endDate}
            className={reportFieldClass}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="h-9 flex-1 rounded-xl">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Search
          </Button>
          <Link href={listPath} className={reportSecondaryLinkClass}>
            Clear
          </Link>
        </div>
      </div>
      <p className={reportToolbarNoteClass}>
        Without dates everyone who ever signed up is listed. Dates use the company time zone ({timeZoneLabel}).
      </p>
    </form>
  );
}
