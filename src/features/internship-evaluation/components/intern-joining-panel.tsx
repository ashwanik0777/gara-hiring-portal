import React from "react";
import Link from "next/link";
import { ArrowRight, UserCheck } from "lucide-react";
import { ApplicationStatus, EmployeeStatus, EvaluationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkInternJoinedDialog } from "@/features/employees/components/mark-intern-joined-dialog";
import type { ReportingManagerOption } from "@/features/employees/types";
import type { EvaluationEnrollmentDetail } from "../types";
import { getInternJourneyState } from "../joining-state";
import { InternJourneyBadge } from "./intern-journey-badge";

interface InternJoiningPanelProps {
  enrollment: EvaluationEnrollmentDetail;
  /** ADMIN, or HR with canEmployees (re-checked by the Server Action). */
  canMarkJoined: boolean;
  managerOptions: ReportingManagerOption[];
  /** Employee records route for this portal, or null when the viewer cannot open them. */
  employeesHrefBase: string | null;
}

function formatCalendarDay(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Internship step 2 in the evaluation cockpit: after a PASSED evaluation, HR marks the intern
 * as joined. Shown only once a final PASSED outcome exists or the person already joined.
 */
export function InternJoiningPanel({
  enrollment,
  canMarkJoined,
  managerOptions,
  employeesHrefBase,
}: InternJoiningPanelProps) {
  const employment = enrollment.employment;
  const joinedHere = employment?.viaThisApplication ? employment : null;
  const state = getInternJourneyState({
    evaluationStatus: enrollment.status,
    joinedAs: joinedHere ? joinedHere.employmentType : undefined,
  });

  if (!joinedHere && enrollment.status !== EvaluationStatus.PASSED) {
    return null;
  }

  let body: React.ReactNode;
  if (joinedHere) {
    body = (
      <div className="space-y-3">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-muted-foreground">Employee code</dt>
            <dd className="font-mono font-semibold text-foreground">{joinedHere.employeeCode}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Joining date</dt>
            <dd className="font-semibold text-foreground">{formatCalendarDay(joinedHere.joiningDate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Employment status</dt>
            <dd className="font-semibold text-foreground">{joinedHere.status}</dd>
          </div>
        </dl>
        {employeesHrefBase && (
          <Link href={`${employeesHrefBase}/${joinedHere.id}`}>
            <Button size="sm" variant="outline" className="gap-1.5">
              Open employee record <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Link>
        )}
      </div>
    );
  } else if (employment && employment.status !== EmployeeStatus.EXITED) {
    body = (
      <p className="text-muted-foreground">
        {enrollment.candidateName} already has a current employee record ({employment.employeeCode},{" "}
        {employment.status}), so a new joining cannot be recorded. Record their exit on the employee
        record first.
      </p>
    );
  } else if (enrollment.applicationStatus !== ApplicationStatus.EVALUATION_SELECTED) {
    body = (
      <p className="text-muted-foreground">
        The application is in stage {enrollment.applicationStatus.replace(/_/g, " ")}. Intern joining is
        recorded only while the application is &quot;Selected for evaluation&quot;
        {enrollment.applicationStatus === ApplicationStatus.OFFERED ||
        enrollment.applicationStatus === ApplicationStatus.OFFER_ACCEPTED
          ? "; this candidate is following the job offer flow on the application page."
          : "."}
      </p>
    );
  } else if (canMarkJoined) {
    // An exited record (if any) is reused: same employee code, new employment period.
    const returningCode = employment?.employeeCode ?? null;
    body = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {returningCode ? (
            <>
              {enrollment.candidateName} worked here before (employee code{" "}
              <span className="font-mono text-foreground">{returningCode}</span>). When they have started,
              record the re-joining: the same record and code are reused and a new employment period starts.
            </>
          ) : (
            <>
              When {enrollment.candidateName} has started, record the joining. This grants the INTERN role
              and opens the intern workspace, attendance, leave, payslips, ID card &amp; certificate.
            </>
          )}
        </p>
        <MarkInternJoinedDialog
          enrollmentId={enrollment.id}
          candidateName={enrollment.candidateName}
          defaultDepartment={enrollment.openingDepartment}
          defaultDesignation={enrollment.openingTitle}
          managerOptions={managerOptions}
          existingEmployeeCode={returningCode}
        />
      </div>
    );
  } else {
    body = (
      <p className="text-muted-foreground">
        HR or an administrator with the employees permission records the joining.
      </p>
    );
  }

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Joining
          </CardTitle>
          <InternJourneyBadge state={state} />
        </div>
      </CardHeader>
      <CardContent className="pt-4 text-xs">{body}</CardContent>
    </Card>
  );
}
