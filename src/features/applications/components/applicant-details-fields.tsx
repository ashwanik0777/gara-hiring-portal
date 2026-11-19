"use client";

import * as React from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApplyFieldError } from "@/features/application-forms/apply-field-errors";
import {
  APPLICANT_DETAIL_FIELDS,
  YEAR_OF_STUDY_OPTIONS,
  graduationYearOptions,
} from "../applicant-details";

export interface ApplicantDetailsDefaults {
  college: { id: string; name: string } | null;
  branch: string | null;
  yearOfStudy: number | null;
  graduationYear: number | null;
}

interface CollegeSuggestion {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

/**
 * College picker: suggestions from the college master as the student types; a name that is
 * not listed is sent as typed and added for staff approval. Implements the ARIA combobox
 * pattern (arrow keys, Enter, Escape).
 */
function CollegeCombobox({ initial, required }: { initial: ApplicantDetailsDefaults["college"]; required: boolean }) {
  const error = useApplyFieldError(APPLICANT_DETAIL_FIELDS.collegeName);
  const [text, setText] = React.useState(initial?.name ?? "");
  const [selected, setSelected] = React.useState(initial);
  const [suggestions, setSuggestions] = React.useState<CollegeSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const listId = React.useId();
  const inputId = React.useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  React.useEffect(() => {
    const query = text.trim();
    if (query.length < 2 || (selected && selected.name === text)) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/colleges?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { colleges: [] }))
        .then((data: { colleges?: CollegeSuggestion[] }) => {
          setSuggestions(data.colleges ?? []);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          // Typing on is always possible; suggestions are only a help.
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, selected]);

  const choose = (college: CollegeSuggestion) => {
    setSelected({ id: college.id, name: college.name });
    setText(college.name);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative space-y-1.5 md:col-span-2">
      <label htmlFor={inputId} className="block text-xs font-semibold text-foreground">
        College / University{required ? " *" : ""}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
        autoComplete="off"
        required={required}
        maxLength={150}
        placeholder="Start typing your college name"
        className={inputClass}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (selected && event.target.value !== selected.name) setSelected(null);
          if (event.target.value.trim().length < 2) {
            setSuggestions([]);
            setOpen(false);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {/* What the server receives: the picked college, or the name as typed. */}
      <input type="hidden" name={APPLICANT_DETAIL_FIELDS.collegeId} value={selected?.id ?? ""} />
      <input type="hidden" name={APPLICANT_DETAIL_FIELDS.collegeName} value={selected ? "" : text} />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching colleges"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {suggestions.map((college, index) => (
            <li
              key={college.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-muted" : "hover:bg-muted/60"}`}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(college);
              }}
            >
              <span className="font-medium text-foreground">{college.name}</span>
              {(college.city || college.state) && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {[college.city, college.state].filter(Boolean).join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p id={hintId} className="text-xs text-muted-foreground">
        Not in the list? Type its full name; we will add it.
      </p>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function SelectField({
  label,
  name,
  required,
  defaultValue,
  options,
  placeholder,
}: {
  label: string;
  name: string;
  required: boolean;
  defaultValue: number | null;
  options: Array<{ value: number | string; label: string }>;
  placeholder: string;
}) {
  const error = useApplyFieldError(name);
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue === null ? "" : String(defaultValue)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/**
 * Education details and consent shown on every apply form (outside the staff form builder).
 * College and graduation year are required for internships; consent is always required.
 */
export function ApplicantDetailsFields({
  defaults,
  isInternship,
  currentYear,
}: {
  defaults: ApplicantDetailsDefaults;
  isInternship: boolean;
  currentYear: number;
}) {
  const branchError = useApplyFieldError(APPLICANT_DETAIL_FIELDS.branch);
  const consentError = useApplyFieldError(APPLICANT_DETAIL_FIELDS.consent);
  const branchId = React.useId();
  const consentId = React.useId();

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
          Your education
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CollegeCombobox initial={defaults.college} required={isInternship} />

          <div className="space-y-1.5">
            <label htmlFor={branchId} className="block text-xs font-semibold text-foreground">
              Branch / Course
            </label>
            <input
              id={branchId}
              name={APPLICANT_DETAIL_FIELDS.branch}
              type="text"
              maxLength={100}
              defaultValue={defaults.branch ?? ""}
              placeholder="e.g. Computer Science and Engineering"
              aria-invalid={branchError ? true : undefined}
              className={inputClass}
            />
            <FieldError id={`${branchId}-error`} message={branchError} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Year of study"
              name={APPLICANT_DETAIL_FIELDS.yearOfStudy}
              required={false}
              defaultValue={defaults.yearOfStudy}
              options={YEAR_OF_STUDY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              placeholder="Graduated / not studying"
            />
            <SelectField
              label="Graduation year"
              name={APPLICANT_DETAIL_FIELDS.graduationYear}
              required={isInternship}
              defaultValue={defaults.graduationYear}
              options={graduationYearOptions(currentYear).map((year) => ({ value: year, label: String(year) }))}
              placeholder="Select"
            />
          </div>
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-5">
          <label htmlFor={consentId} className="flex items-start gap-3 text-sm text-foreground">
            <input
              id={consentId}
              name={APPLICANT_DETAIL_FIELDS.consent}
              type="checkbox"
              required
              aria-invalid={consentError ? true : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
            />
            <span>
              I have read and agree to the{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-primary underline underline-offset-4">
                Privacy Policy
              </Link>{" "}
              and the{" "}
              <Link href="/terms" target="_blank" className="font-medium text-primary underline underline-offset-4">
                Terms of Service
              </Link>
              . *
            </span>
          </label>
          <FieldError id={`${consentId}-error`} message={consentError} />
        </div>
      </CardContent>
    </Card>
  );
}
