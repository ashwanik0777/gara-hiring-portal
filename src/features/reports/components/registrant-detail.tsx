import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck, User, UserPlus } from "lucide-react";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { REGISTRATION_INTEREST_LABELS } from "../services/registration-analytics-service";
import type { RegistrantDetail, RegistrantProfileLink } from "../types";

interface RegistrantDetailViewProps {
  detail: RegistrantDetail;
  /** The Registrations page of the current console, e.g. "/admin/registrations". */
  listPath: string;
  /** Staff application pages, e.g. "/admin/applications"; null when the viewer cannot open them. */
  applicationsPath: string | null;
}

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: BUSINESS_TIME_ZONE,
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function NotProvided() {
  return <span className="text-muted-foreground">Not provided</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 @md:grid-cols-[11rem_1fr] @md:gap-3">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function TextValue({ value }: { value: string | null }) {
  return value ? <>{value}</> : <NotProvided />;
}

/** Opens only safe https links (new tab, no opener/referrer); anything else is plain text. */
function ProfileLinkValue({ link, label }: { link: RegistrantProfileLink; label: string }) {
  if (!link.value) return <NotProvided />;
  if (!link.href) {
    return (
      <span>
        <span className="break-all">{link.value}</span>{" "}
        <span className="text-[11px] text-muted-foreground">(not an https link, so it is not opened from here)</span>
      </span>
    );
  }
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${label}: ${link.href} (opens in a new tab)`}
    >
      <span className="truncate">{link.href}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

function SectionCard({
  id,
  title,
  icon,
  action,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-2xl border border-border/80 p-4 shadow-2xs sm:p-5">
      <section aria-labelledby={id}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-primary" aria-hidden="true">
              {icon}
            </span>
            <CardTitle id={id} className="text-sm font-bold text-foreground">
              {title}
            </CardTitle>
          </div>
          {action}
        </div>
        {children}
      </section>
    </Card>
  );
}

/**
 * Everything one registrant entered at sign-up and in their candidate profile, plus their
 * applications. Server component; the data comes from `getRegistrantDetail`, which never
 * selects passwords, sessions, tokens, OTP data or IP addresses.
 */
export function RegistrantDetailView({ detail, listPath, applicationsPath }: RegistrantDetailViewProps) {
  const { profileCompleteness: completeness } = detail;
  const completenessPct = completeness.total > 0 ? Math.round((completeness.completed / completeness.total) * 100) : 0;

  return (
    <div className="w-full space-y-6">
      <Link
        href={listPath}
        className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All registrations
      </Link>

      <Card className="rounded-2xl border border-border/80 p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary"
            >
              {initials(detail.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-foreground">{detail.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{detail.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{detail.stageLabel}</Badge>
            <Badge variant={detail.emailVerified ? "success" : "warning"}>
              {detail.emailVerified ? "E-mail verified" : "E-mail not verified"}
            </Badge>
            <Badge variant="secondary">Signed up for: {REGISTRATION_INTEREST_LABELS[detail.interest]}</Badge>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard
            id="registrant-profile-heading"
            title="Candidate profile"
            icon={<User className="h-4 w-4" />}
            action={
              <span className="font-mono text-[11px] text-muted-foreground">
                {completeness.completed} of {completeness.total} fields filled in
              </span>
            }
          >
            <div
              role="meter"
              aria-label="Profile completeness"
              aria-valuemin={0}
              aria-valuemax={completeness.total}
              aria-valuenow={completeness.completed}
              aria-valuetext={`${completeness.completed} of ${completeness.total} profile fields filled in`}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${completenessPct}%` }} />
            </div>
            <dl className="@container divide-y divide-border/50">
              <Field label="Signed up for">{REGISTRATION_INTEREST_LABELS[detail.interest]}</Field>
              <Field label="Phone">
                <TextValue value={detail.phone} />
              </Field>
              <Field label="Location">
                <TextValue value={detail.location} />
              </Field>
              <Field label="College or organization">
                <TextValue value={detail.currentOrganization} />
              </Field>
              <Field label="Highest education">
                <TextValue value={detail.highestEducation} />
              </Field>
              <Field label="LinkedIn">
                <ProfileLinkValue link={detail.linkedin} label="LinkedIn" />
              </Field>
              <Field label="GitHub">
                <ProfileLinkValue link={detail.github} label="GitHub" />
              </Field>
              <Field label="Portfolio">
                <ProfileLinkValue link={detail.portfolio} label="Portfolio" />
              </Field>
              <Field label="Profile last updated">
                <time dateTime={detail.profileUpdatedAt.toISOString()}>
                  {dateTimeFormat.format(detail.profileUpdatedAt)}
                </time>
              </Field>
            </dl>
          </SectionCard>

          <SectionCard
            id="registrant-applications-heading"
            title="Applications"
            icon={<FileText className="h-4 w-4" />}
            action={<span className="font-mono text-[11px] text-muted-foreground">{detail.applicationCount} submitted</span>}
          >
            {detail.applications.length === 0 ? (
              <EmptyState
                title="No applications yet"
                description="This person has not submitted an application. Drafts are not shown."
                icon={<FileText className="h-6 w-6 text-primary" />}
              />
            ) : (
              <>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-xs">
                    <caption className="sr-only">Applications submitted by {detail.name}, newest first</caption>
                    <thead>
                      <tr className="border-b border-border/80 text-[11px] text-muted-foreground">
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold">Reference</th>
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold">Opening</th>
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold">Status</th>
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {detail.applications.map((application) => (
                        <tr key={application.id}>
                          <th scope="row" className="py-2.5 px-3 text-left font-mono font-medium">
                            {applicationsPath ? (
                              <Link
                                href={`${applicationsPath}/${encodeURIComponent(application.id)}`}
                                className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {application.referenceCode}
                              </Link>
                            ) : (
                              application.referenceCode
                            )}
                          </th>
                          <td className="py-2.5 px-3">
                            <span className="font-medium text-foreground">{application.openingTitle}</span>
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              {application.openingType === "FULL_TIME" ? "Full-time" : "Internship"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant="outline" className="text-[10px]">
                              {application.statusLabel}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            <time dateTime={application.submittedAt.toISOString()}>{application.submittedDate}</time>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.applicationCount > detail.applications.length && (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Showing the {detail.applications.length} most recent of {detail.applicationCount} applications.
                  </p>
                )}
              </>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard id="registrant-account-heading" title="Account" icon={<UserPlus className="h-4 w-4" />}>
            <dl className="@container divide-y divide-border/50">
              <Field label="Name">{detail.name}</Field>
              <Field label="E-mail">
                <span className="break-all">{detail.email}</span>
              </Field>
              <Field label="E-mail verified">{detail.emailVerified ? "Yes" : "No"}</Field>
              <Field label="Signed up">
                <time dateTime={detail.signedUpAt.toISOString()}>{dateTimeFormat.format(detail.signedUpAt)}</time>
              </Field>
              <Field label="Sign-up method">
                <TextValue value={detail.signUpMethod} />
              </Field>
              {detail.signInMethods.length > 1 && (
                <Field label="Sign-in methods">{detail.signInMethods.join(", ")}</Field>
              )}
              <Field label="Current stage">{detail.stageLabel}</Field>
            </dl>
          </SectionCard>

          <p className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Opening this page is recorded in the audit log. Passwords, sessions and sign-in codes are never shown.
          </p>
        </div>
      </div>
    </div>
  );
}
