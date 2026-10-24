import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, ArrowRight, Calendar, Clock, UserCheck } from "lucide-react";
import { evaluationService } from "../services/evaluation-service";
import { resolveEvaluationAccess } from "../services/enrollment-access";
import { EvaluationCockpit, getEvaluationBadge } from "./evaluation-cockpit";

export type EvaluationPortal = "admin" | "subadmin" | "recruitment";

const PORTAL_PATHS: Record<EvaluationPortal, { evaluations: string; applications: string }> = {
  admin: { evaluations: "/admin/evaluations", applications: "/admin/applications" },
  subadmin: { evaluations: "/subadmin/evaluations", applications: "/subadmin/applications" },
  recruitment: { evaluations: "/recruitment/evaluations", applications: "/recruitment/applications" },
};

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

/**
 * Evaluations list: ADMIN/HR see every enrollment, supervisors only the interns assigned to them.
 */
export async function EvaluationListView({ portal }: { portal: EvaluationPortal }) {
  const { user, access } = await authorizeViewer(portal);
  if (!access) {
    return <UnauthorizedState message={UNAUTHORIZED_MESSAGE} />;
  }

  const paths = PORTAL_PATHS[portal];
  const enrollments = await evaluationService.listEnrollmentsForStaff(user);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Award className="h-6 w-6 text-primary" /> Supervised Evaluations & Onboarding
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {access.scope === "ALL"
              ? "All interns in the supervised evaluation and onboarding pipeline."
              : "Interns assigned to you for supervision."}
          </p>
        </div>
      </div>

      {enrollments.length === 0 ? (
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
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {enrollments.map((enr) => (
            <Card key={enr.id} className="border-border hover:border-primary/40 transition-colors shadow-xs">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {enr.referenceCode}
                    </span>
                    {getEvaluationBadge(enr.status)}
                    <span className="text-xs text-muted-foreground">
                      {enr.openingTitle} ({enr.openingDepartment})
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-foreground">{enr.candidateName}</h3>
                    <p className="text-xs text-muted-foreground">{enr.candidateEmail}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Checkpoints reviewed: {enr.reviewedCheckpoints} / {enr.totalCheckpoints}
                    </span>
                    {enr.supervisorName ? (
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Supervisor: {enr.supervisorName}
                      </span>
                    ) : (
                      <span className="text-warning text-xs">No supervisor assigned</span>
                    )}
                    {enr.startDate && enr.endDate && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(enr.startDate).toLocaleDateString()} → {new Date(enr.endDate).toLocaleDateString()}
                      </span>
                    )}
                    {enr.idCardNumber && (
                      <span className="font-mono">ID card: {enr.idCardNumber}</span>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                  <Link href={`${paths.evaluations}/${enr.id}`}>
                    <Button size="sm" className="gap-1.5">
                      Evaluation Cockpit <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Evaluation cockpit for one enrollment, scoped to the viewer (OD-001 / SEC-15).
 */
export async function EvaluationCockpitView({
  portal,
  enrollmentId,
}: {
  portal: EvaluationPortal;
  enrollmentId: string;
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
  return (
    <EvaluationCockpit
      enrollment={enrollment}
      listHref={paths.evaluations}
      applicationHref={
        access.permissions.canApplications ? `${paths.applications}/${enrollment.applicationId}` : null
      }
      canDecide={access.scope === "ALL"}
    />
  );
}
