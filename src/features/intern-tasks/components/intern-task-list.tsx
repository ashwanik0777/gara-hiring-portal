import React from "react";
import type { InternTaskDetail } from "../types";
import { SubmissionReviewStatus, TaskPriority, TaskStatus } from "@/types/enums";
import { TaskSubmissionDialog } from "./task-submission-dialog";
import { ReviewSubmissionDialog } from "./review-submission-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  RotateCcw,
  Calendar,
  ExternalLink,
} from "lucide-react";

interface InternTaskListProps {
  tasks: InternTaskDetail[];
  isSupervisorView?: boolean;
}

function getPriorityBadge(priority: TaskPriority) {
  switch (priority) {
    case TaskPriority.URGENT:
      return <Badge variant="destructive">Urgent</Badge>;
    case TaskPriority.HIGH:
      return <Badge variant="warning">High</Badge>;
    case TaskPriority.MEDIUM:
      return <Badge variant="default">Medium</Badge>;
    case TaskPriority.LOW:
      return <Badge variant="outline">Low</Badge>;
  }
}

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case TaskStatus.COMPLETED:
      return <Badge variant="success">Approved & Completed</Badge>;
    case TaskStatus.SUBMITTED:
      return <Badge variant="default">Submitted (Under Review)</Badge>;
    case TaskStatus.REVISION_REQUESTED:
      return <Badge variant="warning">Revision Requested</Badge>;
    case TaskStatus.IN_PROGRESS:
      return <Badge variant="outline">In Progress</Badge>;
    case TaskStatus.ASSIGNED:
      return <Badge variant="secondary">Assigned</Badge>;
    case TaskStatus.BLOCKED:
      return <Badge variant="destructive">Blocked</Badge>;
  }
}

/**
 * Task cards with submission history. A Server Component: only the submit / review dialog
 * triggers are client code, and their forms load on first use.
 */
export function InternTaskList({ tasks, isSupervisorView = false }: InternTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">No tasks assigned yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          {isSupervisorView
            ? "Assign project deliverables and milestones using the button above."
            : "Your supervisor will assign your deliverables and milestones here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => {
        const isCompleted = task.status === TaskStatus.COMPLETED;
        const needsRevision = task.status === TaskStatus.REVISION_REQUESTED;
        // Only the latest submission can be reviewed, and only while it is pending.
        const latestSubmission = task.submissions.reduce<InternTaskDetail["submissions"][number] | null>(
          (latest, sub) => (!latest || sub.versionNumber > latest.versionNumber ? sub : latest),
          null
        );
        const reviewableSubmission =
          isSupervisorView &&
          !isCompleted &&
          latestSubmission?.status === SubmissionReviewStatus.PENDING
            ? latestSubmission
            : null;

        return (
          <Card key={task.id} className="border-border">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base font-semibold text-foreground">
                      {task.title}
                    </h4>
                    {getPriorityBadge(task.priority)}
                    {getStatusBadge(task.status)}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>Assigned by {task.assignedBy.name}</span>
                    {task.dueDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>

                {!isSupervisorView && !isCompleted && (
                  <div className="shrink-0">
                    <TaskSubmissionDialog
                      taskId={task.id}
                      taskTitle={task.title}
                      versionNumber={latestSubmission?.versionNumber ?? 0}
                    />
                  </div>
                )}

                {reviewableSubmission && (
                  <div className="shrink-0">
                    <ReviewSubmissionDialog
                      taskId={task.id}
                      submissionId={reviewableSubmission.id}
                      versionNumber={reviewableSubmission.versionNumber}
                      submissionNotes={reviewableSubmission.submissionNotes}
                      deliverableUrls={reviewableSubmission.deliverableUrls}
                    />
                  </div>
                )}
              </div>

              <div className="mt-3 text-sm text-foreground/90 whitespace-pre-wrap rounded-md bg-muted/20 p-3 border border-border/50 text-xs leading-relaxed">
                {task.description}
              </div>

              {/* Revision Request Banner */}
              {needsRevision && task.changeRequestNotes && (
                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <RotateCcw className="h-4 w-4" />
                    <span>Supervisor Revision Request</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                    {task.changeRequestNotes}
                  </p>
                </div>
              )}

              {/* Submissions History */}
              {task.submissions.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/60">
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Submission History ({task.submissions.length} version{task.submissions.length > 1 ? "s" : ""})
                  </p>
                  <div className="space-y-2">
                    {task.submissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="rounded-md border border-border/80 bg-card p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            Version {sub.versionNumber}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(sub.submittedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          {sub.submissionNotes}
                        </p>

                        {sub.deliverableUrls && sub.deliverableUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {sub.deliverableUrls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Deliverable Link #{i + 1}
                              </a>
                            ))}
                          </div>
                        )}

                        {sub.supervisorFeedback && (
                          <div className="mt-2 rounded bg-muted/40 p-2 text-[11px] text-foreground border border-border/40">
                            <span className="font-semibold text-primary block mb-0.5">
                              Feedback from {sub.reviewedBy?.name || "Supervisor"}:
                            </span>
                            {sub.supervisorFeedback}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
