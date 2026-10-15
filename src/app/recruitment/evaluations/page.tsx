import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { Role, EvaluationStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Award, Calendar, ArrowRight, UserCheck, Clock } from "lucide-react";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MENTOR, Role.MANAGER];

function getEvaluationBadge(status: EvaluationStatus) {
  switch (status) {
    case EvaluationStatus.PENDING_TRIGGER:
      return <Badge variant="warning">Pending Start (OD-001)</Badge>;
    case EvaluationStatus.IN_PROGRESS:
      return <Badge variant="default">In Progress (7 Days)</Badge>;
    case EvaluationStatus.UNDER_REVIEW:
      return <Badge variant="warning">Under Review</Badge>;
    case EvaluationStatus.PASSED:
      return <Badge variant="success">Passed & Qualified</Badge>;
    case EvaluationStatus.FAILED:
      return <Badge variant="destructive">Did Not Meet Benchmark</Badge>;
    case EvaluationStatus.EXTENDED:
      return <Badge variant="secondary">Extended</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export const instant = false;

export default async function EvaluationsListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!isStaff) redirect("/candidate/dashboard");

  const enrollments = await prisma.internshipEnrollment.findMany({
    include: {
      user: {
        select: { name: true, email: true },
      },
      application: {
        include: {
          opening: {
            select: { title: true, department: true },
          },
        },
      },
      supervisor: {
        select: { name: true, email: true },
      },
      checkpoints: {
        select: { status: true },
      },
      idCard: {
        select: { cardNumber: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Award className="h-6 w-6 text-primary" /> Supervised Evaluations & Onboarding
          </h1>
        </div>
      </div>

      {enrollments.length === 0 ? (
        <EmptyState
          title="No candidates in evaluation yet"
          description="Candidates advanced to 'Evaluation Selected' from the recruitment queue will appear here."
          action={
            <Link href="/recruitment/applications">
              <Button size="sm">Go to Application Queue</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {enrollments.map((enr) => {
            const completedCheckpoints = enr.checkpoints.filter((c) => c.status === "REVIEWED").length;

            return (
              <Card
                key={enr.id}
                className="border-border hover:border-primary/40 transition-colors shadow-xs"
              >
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {enr.application.referenceCode}
                      </span>
                      {getEvaluationBadge(enr.status)}
                      <span className="text-xs text-muted-foreground">
                        {enr.application.opening.title} ({enr.application.opening.department})
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {enr.user.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{enr.user.email}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        Checkpoints: {completedCheckpoints} / 7 Completed
                      </span>
                      {enr.supervisor ? (
                        <span className="flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5" />
                          Supervisor: {enr.supervisor.name}
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
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                    <Link href={`/recruitment/evaluations/${enr.id}`}>
                      <Button size="sm" className="gap-1.5">
                        Evaluation Cockpit <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
