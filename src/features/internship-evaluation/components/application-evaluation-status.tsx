import React from "react";
import Link from "next/link";
import { ArrowRight, Award, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmploymentType, EvaluationStatus } from "@/types/enums";
import { getInternJourneyState } from "../joining-state";
import { getEvaluationBadge } from "./evaluation-cockpit";
import { InternJourneyBadge } from "./intern-journey-badge";

interface ApplicationEvaluationStatusProps {
  evaluation: {
    enrollmentId: string;
    status: EvaluationStatus;
    supervisorName: string | null;
  };
  joinedEmployee: { id: string; employeeCode: string; employmentType: EmploymentType | null } | null;
  /** Evaluation cockpit link, or null when the viewer cannot open evaluation records. */
  evaluationHref: string | null;
  /** Employee record link, or null when the viewer cannot open employee records. */
  employeeHref: string | null;
}

/**
 * Read-only summary of the internship evaluation and joining state on the staff application
 * detail page. Actions live in the evaluation cockpit.
 */
export function ApplicationEvaluationStatus({
  evaluation,
  joinedEmployee,
  evaluationHref,
  employeeHref,
}: ApplicationEvaluationStatusProps) {
  const state = getInternJourneyState({
    evaluationStatus: evaluation.status,
    joinedAs: joinedEmployee ? joinedEmployee.employmentType : undefined,
  });

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4 text-primary" aria-hidden="true" /> Internship evaluation &amp; joining
          </CardTitle>
          <InternJourneyBadge state={state} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <div className="flex items-center gap-1.5">Evaluation: {getEvaluationBadge(evaluation.status)}</div>
          <span className="flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {evaluation.supervisorName ? `Supervisor: ${evaluation.supervisorName}` : "No supervisor assigned"}
          </span>
          {joinedEmployee && (
            <span className="font-mono text-foreground">Employee code: {joinedEmployee.employeeCode}</span>
          )}
        </div>

        {state === "PASSED_AWAITING_JOINING" && (
          <p className="text-muted-foreground">
            The evaluation passed. HR records the joining with &quot;Mark as joined&quot; in the evaluation cockpit.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {evaluationHref && (
            <Link href={evaluationHref}>
              <Button size="sm" variant="outline" className="gap-1.5">
                Evaluation cockpit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Link>
          )}
          {joinedEmployee && employeeHref && (
            <Link href={employeeHref}>
              <Button size="sm" variant="outline" className="gap-1.5">
                Employee record <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
