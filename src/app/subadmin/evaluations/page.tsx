import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { EvaluationStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Award, ArrowRight, UserCheck, Clock } from "lucide-react";

export const instant = false;

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

export default async function SubAdminEvaluationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/evaluations");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canEvaluations) redirect("/subadmin");

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
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="warning">Policy Gated (OD-001 / OD-003)</Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Award className="h-6 w-6 text-primary" /> Intern Evaluation Monitor
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            7-working-day evaluation window tracking, supervisor assignments, and pass/fail assessment milestones.
          </p>
        </div>
      </div>

      {enrollments.length === 0 ? (
        <EmptyState
          title="No interns enrolled in evaluation track"
          description="Candidates who accept offers or are selected for evaluation will appear here."
          action={
            <Link href="/subadmin/applications">
              <Button size="sm">View Applications</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {enrollments.map((enr) => {
            const completedCheckpoints = enr.checkpoints.filter((c) => c.status === "REVIEWED").length;
            const totalCheckpoints = enr.checkpoints.length;

            return (
              <Card key={enr.id} className="border-border hover:border-primary/40 transition-colors">
                <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {enr.idCard?.cardNumber || enr.application.referenceCode}
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
                      <span className="flex items-center gap-1">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        Supervisor: {enr.supervisor?.name || "Unassigned"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Start: {enr.startDate ? new Date(enr.startDate).toLocaleDateString() : "Pending (OD-001)"}
                      </span>
                      {totalCheckpoints > 0 && (
                        <span className="flex items-center gap-1">
                          <Award className="h-3.5 w-3.5" />
                          Checkpoints: {completedCheckpoints}/{totalCheckpoints}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                      Evaluation Dossier <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
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
