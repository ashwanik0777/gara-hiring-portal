import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Clock,
  GraduationCap,
  HelpCircle,
  Layers,
  MailCheck,
  MailX,
  UserPlus,
  Users,
} from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatGrid, StatGridSkeleton } from "@/components/ui/stat-card";
import { registrationAnalyticsService } from "../services/registration-analytics-service";
import type { RegistrationDirectorySummary } from "../types";
import {
  REGISTRANT_DIRECTORY_PARAM_KEYS,
  RegistrantDirectoryFiltersForm,
  registrantDirectoryHref,
} from "./registrations-filters";
import {
  RegistrantDirectoryList,
  RegistrantDirectoryListSkeleton,
  readRegistrantDirectoryParams,
} from "./registrations-list";
import { reportToolbarClass } from "./report-toolbar";

type SearchParamValue = string | string[] | undefined;

interface RegistrationsDirectoryProps {
  /** Already authorized: ADMIN, or HR holding canReports. */
  user: AuthenticatedUser;
  basePath: "/admin" | "/subadmin";
  searchParams: Record<string, SearchParamValue>;
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}% of everyone` : "No registrations yet";
}

/**
 * The Registrations page: all-time sign-up figures (each card opens the matching filtered
 * list), the filter row and the registrant table. Figures and table stream in sibling
 * Suspense boundaries so their queries run in parallel.
 */
export function RegistrationsDirectory({ user, basePath, searchParams }: RegistrationsDirectoryProps) {
  const listPath = `${basePath}/registrations`;
  const { input, formValues } = readRegistrantDirectoryParams(searchParams);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Everyone who created a candidate account, newest first, with what they entered at sign-up. Staff accounts are
          never listed. Applications are reported separately in the hiring funnel.
        </p>
        <Link
          href={`${basePath}/reports?tab=registrations`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Registration analytics
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <Suspense fallback={<RegistrationDirectoryFiguresSkeleton />}>
        <RegistrationDirectoryFigures user={user} listPath={listPath} />
      </Suspense>

      <RegistrantDirectoryFiltersForm listPath={listPath} values={formValues} timeZoneLabel={BUSINESS_TIME_ZONE} />

      {/* Keyed by the filters so a new page or filter shows the skeleton while it loads. */}
      <Suspense key={JSON.stringify(input)} fallback={<RegistrantDirectoryListSkeleton />}>
        <RegistrantDirectoryList user={user} params={input} listPath={listPath} />
      </Suspense>
    </div>
  );
}

function FigureGroupHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
      {children}
    </h2>
  );
}

async function RegistrationDirectoryFigures({ user, listPath }: { user: AuthenticatedUser; listPath: string }) {
  let summary: RegistrationDirectorySummary | null = null;
  try {
    summary = await registrationAnalyticsService.getRegistrationSummary(user);
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    logger.error("Registration figures could not be loaded", error);
  }
  const unavailable = summary === null;
  const keys = REGISTRANT_DIRECTORY_PARAM_KEYS;
  const href = (params: Record<string, string>) => registrantDirectoryHref(listPath, params);
  const total = summary?.total ?? 0;

  return (
    <div className="space-y-5">
      <section aria-labelledby="registration-figures-interest" className="space-y-2.5">
        <FigureGroupHeading id="registration-figures-interest">Who signed up (all time)</FigureGroupHeading>
        <StatGrid columns={5} label="Registrations by what people signed up for">
          <StatCard
            label="Total registrations"
            value={summary?.total ?? null}
            icon={Users}
            tone="blue"
            hint="Candidate accounts"
            href={listPath}
            unavailable={unavailable}
          />
          <StatCard
            label="Internship"
            value={summary?.byInterest.INTERNSHIP ?? null}
            icon={GraduationCap}
            tone="violet"
            hint={summary ? share(summary.byInterest.INTERNSHIP, total) : undefined}
            href={href({ [keys.interest]: "INTERNSHIP" })}
            unavailable={unavailable}
          />
          <StatCard
            label="Job"
            value={summary?.byInterest.JOB ?? null}
            icon={Briefcase}
            tone="indigo"
            hint={summary ? share(summary.byInterest.JOB, total) : undefined}
            href={href({ [keys.interest]: "JOB" })}
            unavailable={unavailable}
          />
          <StatCard
            label="Both"
            value={summary?.byInterest.BOTH ?? null}
            icon={Layers}
            tone="cyan"
            hint={summary ? share(summary.byInterest.BOTH, total) : undefined}
            href={href({ [keys.interest]: "BOTH" })}
            unavailable={unavailable}
          />
          <StatCard
            label="Not chosen"
            value={summary?.byInterest.NOT_CHOSEN ?? null}
            icon={HelpCircle}
            tone="slate"
            hint={summary ? share(summary.byInterest.NOT_CHOSEN, total) : undefined}
            href={href({ [keys.interest]: "NOT_CHOSEN" })}
            unavailable={unavailable}
          />
        </StatGrid>
      </section>

      <section aria-labelledby="registration-figures-progress" className="space-y-2.5">
        <FigureGroupHeading id="registration-figures-progress">Verification and applications</FigureGroupHeading>
        <StatGrid columns={4} label="E-mail verification, applications and new sign-ups">
          <StatCard
            label="E-mail verified"
            value={summary?.emailVerified ?? null}
            icon={MailCheck}
            tone="emerald"
            hint={summary ? share(summary.emailVerified, total) : undefined}
            href={href({ [keys.emailVerified]: "yes" })}
            unavailable={unavailable}
          />
          <StatCard
            label="Not verified"
            value={summary?.emailNotVerified ?? null}
            icon={MailX}
            tone="rose"
            hint={summary ? share(summary.emailNotVerified, total) : undefined}
            href={href({ [keys.emailVerified]: "no" })}
            unavailable={unavailable}
          />
          <StatCard
            label="Not applied yet"
            value={summary?.notApplied ?? null}
            icon={Clock}
            tone="amber"
            hint={summary ? share(summary.notApplied, total) : undefined}
            href={href({ [keys.applied]: "no" })}
            unavailable={unavailable}
          />
          <StatCard
            label="New in the last 7 days"
            value={summary?.newLastSevenDays ?? null}
            icon={UserPlus}
            tone="blue"
            hint={summary ? `Since ${summary.recentSinceDate}` : undefined}
            href={summary ? href({ [keys.startDate]: summary.recentSinceDate }) : undefined}
            unavailable={unavailable}
          />
        </StatGrid>
      </section>
    </div>
  );
}

function RegistrationDirectoryFiguresSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-40" />
        <StatGridSkeleton count={5} columns={5} label="Loading registration figures" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-48" />
        <StatGridSkeleton count={4} columns={4} label="Loading verification and application figures" />
      </div>
    </div>
  );
}

/** `loading.tsx` of the Registrations pages: intro, figures, filter row and table. */
export function RegistrationsPageSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <Skeleton className="h-3.5 w-full max-w-xl" />
        <Skeleton className="hidden h-3.5 w-36 sm:block" />
      </div>
      <RegistrationDirectoryFiguresSkeleton />
      <div className={reportToolbarClass} aria-hidden="true">
        <Skeleton className="mb-3 h-3 w-16" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 rounded-xl" />
          ))}
        </div>
      </div>
      <RegistrantDirectoryListSkeleton />
    </div>
  );
}
