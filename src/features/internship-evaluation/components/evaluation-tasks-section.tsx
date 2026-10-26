import React from "react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { ListPagination } from "@/features/employees/components/list-pagination";
import { SectionUnavailable } from "@/features/employees/components/section-unavailable";
import { InternTaskList } from "@/features/intern-tasks/components/intern-task-list";
import { taskService } from "@/features/intern-tasks/services/task-service";
import type { InternTaskPage } from "@/features/intern-tasks/types";

interface EvaluationTasksSectionProps {
  user: AuthenticatedUser;
  enrollmentId: string;
  /** 1-based page from `?tasksPage=`. */
  page: number;
  /** Builds the cockpit link for a task page (keeps the `#tasks` anchor). */
  hrefFor: (page: number) => string;
}

/**
 * Streamed task list of the evaluation cockpit: one bounded page of tasks with their latest
 * submission versions. The task service re-checks record-level access for the viewer.
 */
export async function EvaluationTasksSection({ user, enrollmentId, page, hrefFor }: EvaluationTasksSectionProps) {
  let result: InternTaskPage;
  try {
    result = await taskService.getEnrollmentTasks(enrollmentId, user, { page });
  } catch (error) {
    return (
      <SectionUnavailable
        title="Assigned tasks"
        message={toActionError(error, "Tasks could not be loaded right now. Please refresh to try again.")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <InternTaskList tasks={result.items} isSupervisorView />
      <ListPagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
        hrefFor={hrefFor}
        label="Task pages"
        itemNoun="tasks"
      />
    </div>
  );
}
