import React, { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EvaluationStatus, Role } from "@prisma/client";
import { getCurrentUser, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError, toActionError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, ArrowRight, Calendar, Clock, UserCheck } from "lucide-react";
import { employeeService } from "@/features/employees/services/employee-service";
import type { ReportingManagerOption } from "@/features/employees/types";
import { FilterChipLink } from "@/features/employees/components/filter-chip-link";
import { ListPagination } from "@/features/employees/components/list-pagination";
import { SectionUnavailable } from "@/features/employees/components/section-unavailable";
import {
  buildListHref,
  firstParam,
  parsePositivePage,
  type RawSearchParams,
} from "@/features/employees/components/list-search-params";
import { evaluationService, FINAL_EVALUATION_OUTCOMES } from "../services/evaluation-service";
import { resolveEvaluationAccess, type EvaluationAccess } from "../services/enrollment-access";
import { getInternJourneyState } from "../joining-state";
import type { EvaluationEnrollmentDetail, EvaluationEnrollmentListPage, SupervisorOption } from "../types";
import { EvaluationCockpit, getEvaluationBadge } from "./evaluation-cockpit";
import { EvaluationListSkeleton, EvaluationTasksSkeleton } from "./evaluation-skeletons";
import { EvaluationTasksSection } from "./evaluation-tasks-section";
import { InternJourneyBadge } from "./intern-journey-badge";

export type EvaluationPortal = "admin" | "subadmin" | "recruitment";

const PORTAL_PATHS: Record<
  EvaluationPortal,
  { evaluations: string; applications: string; employees: string }
> = {
  admin: { evaluations: "/admin/evaluations", applications: "/admin/applications", employees: "/admin/employees" },
  subadmin: {
    evaluations: "/subadmin/evaluations",
    applications: "/subadmin/applications",
    employees: "/subadmin/employees",
  },
  recruitment: {
    evaluations: "/recruitment/evaluations",
    applications: "/recruitment/applications",
    employees: "/recruitment/employees",
  },
};

/** Status filter chips in pipeline order. */
const STATUS_FILTERS: Array<{ value: EvaluationStatus; label: string }> = [
  { value: EvaluationStatus.PENDING_TRIGGER, label: "Pending start" },
  { value: EvaluationStatus.IN_PROGRESS, label: "In progress" },
  { value: EvaluationStatus.UNDER_REVIEW, label: "Under review" },
  { value: EvaluationStatus.EXTENDED, label: "Extended" },
  { value: EvaluationStatus.PASSED, label: "Passed" },
  { value: EvaluationStatus.FAILED, label: "Did not pass" },
];

function isEvaluationStatus(value: string): value is EvaluationStatus {
  return (Object.values(EvaluationStatus) as string[]).includes(value);
}

/** Mirrors the joining Server Action: ADMIN, or HR with the canEmployees permission. */
async function canMarkInternJoined(user: AuthenticatedUser): Promise<boolean> {
  if (user.roles.includes(Role.ADMIN)) return true;
  return user.roles.includes(Role.HR) && (await hasPermission(user, "canEmployees"));
}

/**
 * True when the cockpit should offer "Mark as joined" for this enrollment: no employee record
 * yet, or an EXITED one that is reused when the person re-joins.
 */
function awaitsJoining(enrollment: EvaluationEnrollmentDetail): boolean {
  return (
    enrollment.status === "PASSED" &&
    (enrollment.employment === null || enrollment.employment.status === "EXITED") &&
    enrollment.applicationStatus === "EVALUATION_SELECTED"
  );
}

const UNAUTHORIZED_MESSAGE =
  "Evaluation records are available to ADMIN and HR with evaluation permission, and to the supervisor assigned to the intern.";

/**
 * Authenticates the viewer for an evaluation page. Layouts are not a security boundary, so every
 * evaluation page calls this before loading data.
 */
async function authorizeViewer(portal: EvaluationPortal) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?callbackUrl=${PORTAL_PATHS[portal].evaluations}`);
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  const access = await resolveEvaluationAccess(user);
  return { user, access };
}

interface EvaluationListSectionProps {
  user: AuthenticatedUser;
  access: EvaluationAccess;
  paths: (typeof PORTAL_PATHS)[EvaluationPortal];
  status: EvaluationStatus | null;
  page: number;
}

/** Streamed list body: status chips with database counts, one page of enrollments, paging. */
async function EvaluationListSection({ user, access, paths, status, page }: EvaluationListSectionProps) {
  let result: EvaluationEnrollmentListPage;
  try {
    result = await evaluationService.listEnrollmentsForStaff(user, { status: status ?? undefined, page });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message={UNAUTHORIZED_MESSAGE} />;
    }
    return (
      <SectionUnavailable
        title="Evaluations"
        message={toActionError(error, "The evaluation list could not be loaded right now. Please try again.")}
      />
    );
  }

  const hrefFor = (next: { status?: EvaluationStatus | null; page?: number }) =>
    buildListHref(paths.evaluations, {
      status: next.status === undefined ? status : next.status,
      page: (next.page ?? 1) > 1 ? next.page : null,
    });
  const scopeTotal = Object.values(result.statusCounts).reduce<number>((sum, count) => sum + (count ?? 0), 0);
  const activeFilter = STATUS_FILTERS.find((filter) => filter.value === status) ?? null;

  let emptyState: React.ReactNode = null;
  if (result.items.length === 0) {
    if (scopeTotal === 0) {
      emptyState = (
        <EmptyState
          title={access.scope === "ALL" ? "No candidates in evaluation yet" : "No interns are assigned to you"}
          description={
            access.scope === "ALL"
              ? "Candidates enrolled into the supervised evaluation will appear here."
              : "Interns appear here once HR or an administrator assigns you as their supervisor."
          }
          action={
            access.permissions.canApplications ? (
              <Link href={paths.applications}>
                <Button size="sm">Go to Application Queue</Button>
              </Link>
            ) : undefined
          }
        />
      );
    } else if (result.total === 0 && activeFilter) {
      emptyState = (
        <EmptyState
          title={`No evaluations with status "${activeFilter.label}"`}
          description="Choose another status or show every evaluation in your scope."
          action={
            <Link href={hrefFor({ status: null, page: 1 })}>
              <Button size="sm" variant="outline">
                Show all evaluations
              </Button>
            </Link>
          }
        />
      );
    } else {
      emptyState = (
        <EmptyState
          title="No evaluations on this page"
          description="The list is shorter than the requested page."
          action={
            <Link href={hrefFor({ page: 1 })}>
              <Button size="sm" variant="outline">
                Go to the first page
              </Button>
            </Link>
          }
        />
      );
    }
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Filter evaluations by status" className="flex flex-wrap gap-2">
        <FilterChipLink
          href={hrefFor({ status: null, page: 1 })}
          active={status === null}
          label="All"
          count={scopeTotal}
        />
        {STATUS_FILTERS.filter((filter) => (result.statusCounts[filter.value] ?? 0) > 0 || filter.value === status).map(
          (filter) => (
            <FilterChipLink
              key={filter.value}
              href={hrefFor({ status: filter.value, page: 1 })}
              active={status === filter.value}
              label={filter.label}
              count={result.statusCounts[filter.value] ?? 0}
            />
          )
        )}
      </nav>

      {emptyState ?? (
        <ul className="grid grid-cols-1 gap-3">
          {result.items.map((enr) => (
            <li key={enr.id}>
              <Card className="border-border shadow-xs transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                        {enr.referenceCode}
                      </span>
                      {getEvaluationBadge(enr.status)}
                      <InternJourneyBadge
                        state={getInternJourneyState({
                          evaluationStatus: enr.status,
                          joinedAs: enr.joined ? enr.joinedEmploymentType : undefined,
                        })}
                      />
                      <span className="text-xs text-muted-foreground">
                        {enr.openingTitle} ({enr.openingDepartment})
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-foreground">{enr.candidateName}</h3>
                      <p className="break-all text-xs text-muted-foreground">{enr.candidateEmail}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        Checkpoints reviewed: {enr.reviewedCheckpoints} / {enr.totalCheckpoints}
                      </span>
                      {enr.supervisorName ? (
                        <span className="flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Supervisor: {enr.supervisorName}
                        </span>
                      ) : (
                        <span className="text-xs text-warning">No supervisor assigned</span>
                      )}
                      {enr.startDate && enr.endDate && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                          {new Date(enr.startDate).toLocaleDateString()} → {new Date(enr.endDate).toLocaleDateString()}
                        </span>
                      )}
                      {enr.idCardNumber && <span className="font-mono">ID card: {enr.idCardNumber}</span>}
                    </div>
                  </div>

                  <div className="flex w-full items-end justify-between gap-3 border-t border-border/60 pt-2 sm:w-auto sm:flex-col sm:border-t-0 sm:pt-0">
                    <Link href={`${paths.evaluations}/${enr.id}`}>
                      <Button size="sm" className="gap-1.5">
                        Evaluation Cockpit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ListPagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
        hrefFor={(next) => hrefFor({ page: next })}
        label="Evaluation pages"
        itemNoun="evaluations"
      />
    </div>
  );
}

/**
 * Evaluations list: ADMIN/HR see every enrollment, supervisors only the interns assigned to them.
 * The status filter and page travel in the URL (`?status=&page=`); the list body streams.
 */
export async function EvaluationListView({
  portal,
  searchParams,
}: {
  portal: EvaluationPortal;
  searchParams?: Promise<RawSearchParams>;
}) {
  const { user, access } = await authorizeViewer(portal);
  if (!access) {
    return <UnauthorizedState message={UNAUTHORIZED_MESSAGE} />;
  }

  const paths = PORTAL_PATHS[portal];
  const raw = (await searchParams) ?? {};
  const requestedStatus = firstParam(raw.status);
  const status = isEvaluationStatus(requestedStatus) ? requestedStatus : null;
  const page = parsePositivePage(raw.page);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <Award className="h-6 w-6 text-primary" aria-hidden="true" /> Supervised Evaluations & Onboarding
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {access.scope === "ALL"
              ? "All interns in the supervised evaluation and onboarding pipeline."
              : "Interns assigned to you for supervision."}
          </p>
        </div>
      </div>

      <Suspense key={`${status ?? ""}|${page}`} fallback={<EvaluationListSkeleton />}>
        <EvaluationListSection user={user} access={access} paths={paths} status={status} page={page} />
      </Suspense>
    </div>
  );
}

/**
 * Evaluation cockpit for one enrollment, scoped to the viewer (OD-001 / SEC-15). The task list
 * streams separately (`?tasksPage=`), so the core record paints first.
 */
export async function EvaluationCockpitView({
  portal,
  enrollmentId,
  searchParams,
}: {
  portal: EvaluationPortal;
  enrollmentId: string;
  searchParams?: Promise<RawSearchParams>;
}) {
  const { user, access } = await authorizeViewer(portal);
  if (!access) {
    return <UnauthorizedState message={UNAUTHORIZED_MESSAGE} />;
  }

  let enrollment;
  try {
    enrollment = await evaluationService.getEvaluationDetail(enrollmentId, user);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message={error.message} />;
    }
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const paths = PORTAL_PATHS[portal];
  const canMarkJoined = await canMarkInternJoined(user);
  // Supervisor change: decision authority only, and only before a final outcome.
  const canChangeSupervisor =
    access.scope === "ALL" && !FINAL_EVALUATION_OUTCOMES.includes(enrollment.status);

  // Independent option lists load together; each is skipped when its dialog cannot be shown.
  const [managerOptions, supervisorOptions] = await Promise.all([
    canMarkJoined && awaitsJoining(enrollment)
      ? employeeService.listReportingManagerOptions(user)
      : Promise.resolve<ReportingManagerOption[]>([]),
    canChangeSupervisor
      ? evaluationService
          .listSupervisorOptions(user, enrollment.internUserId)
          .then((options) => options.filter((option) => option.id !== enrollment.supervisor?.id))
      : Promise.resolve<SupervisorOption[]>([]),
  ]);

  const tasksPage = parsePositivePage(((await searchParams) ?? {}).tasksPage);
  const cockpitHref = `${paths.evaluations}/${enrollment.id}`;
  const taskPageHref = (page: number) =>
    `${buildListHref(cockpitHref, { tasksPage: page > 1 ? page : null })}#tasks`;

  return (
    <EvaluationCockpit
      enrollment={enrollment}
      listHref={paths.evaluations}
      applicationHref={
        access.permissions.canApplications ? `${paths.applications}/${enrollment.applicationId}` : null
      }
      canDecide={access.scope === "ALL"}
      joining={{
        canMarkJoined,
        managerOptions,
        employeesHrefBase: canMarkJoined ? paths.employees : null,
      }}
      supervisorChange={{ canChange: canChangeSupervisor, options: supervisorOptions }}
      tasksSection={
        <Suspense fallback={<EvaluationTasksSkeleton />}>
          <EvaluationTasksSection
            user={user}
            enrollmentId={enrollment.id}
            page={tasksPage}
            hrefFor={taskPageHref}
          />
        </Suspense>
      }
    />
  );
}
