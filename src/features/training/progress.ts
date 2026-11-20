import { TRAINING_PASS_CRITERIA } from "@/config/site";

/*
 * Industrial Training pass criteria auto-check (Phase 3B). Pure: no database access, shared by
 * the student's progress bar, the mentor roster and the final result. Rules from the product
 * owner (2026-11-20):
 * - Marks: total marks obtained / total maximum marks of every assignment of the batch; an
 *   assignment that was not submitted counts as 0.
 * - Attendance: classes attended / classes held (started and not cancelled) with attendance taken.
 * - Final project passed and at least one live demo passed.
 * - Pass only when every criterion is met (no override); fail only after the batch has ended.
 */

export type PassCriteria = {
  minMarksPercent: number;
  minAttendancePercent: number;
  finalProjectRequired: boolean;
  liveDemoRequired: boolean;
};

export interface ProgressInput {
  now: Date;
  criteria?: PassCriteria;
  assignments: ReadonlyArray<{ id: string; dueAt: Date; maxMarks: number }>;
  /** This enrollment's submissions. */
  submissions: ReadonlyArray<{ assignmentId: string; marks: number | null }>;
  sessions: ReadonlyArray<{ id: string; startsAt: Date; status: string; attendanceTakenAt: Date | null }>;
  /** This enrollment's attendance rows. */
  attendance: ReadonlyArray<{ sessionId: string; present: boolean }>;
  project: { status: string } | null;
  /** Demo slots booked by this enrollment. */
  demos: ReadonlyArray<{ result: string | null }>;
}

export interface TrainingProgress {
  marks: {
    obtained: number;
    max: number;
    /** null when the batch has no assignments. */
    percent: number | null;
    /** Submitted but not graded yet. */
    ungraded: number;
    /** Assignments whose due time has not passed. */
    open: number;
    met: boolean;
  };
  attendance: {
    present: number;
    /** Classes held with attendance taken. */
    counted: number;
    /** Classes held whose attendance has not been taken yet. */
    unmarked: number;
    /** null when no class has been held with attendance taken. */
    percent: number | null;
    met: boolean;
  };
  project: { status: string | null; required: boolean; met: boolean };
  demo: { passed: boolean; required: boolean; met: boolean };
  allMet: boolean;
  criteria: PassCriteria;
}

/** Percentage with one decimal, for display. */
function percentOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function computeTrainingProgress(input: ProgressInput): TrainingProgress {
  const criteria = input.criteria ?? TRAINING_PASS_CRITERIA;
  const nowMs = input.now.getTime();

  // Marks: every assignment counts; an unsubmitted or ungraded one adds 0 until graded.
  const marksByAssignment = new Map(input.submissions.map((submission) => [submission.assignmentId, submission]));
  let obtained = 0;
  let max = 0;
  let ungraded = 0;
  let open = 0;
  for (const assignment of input.assignments) {
    max += assignment.maxMarks;
    if (assignment.dueAt.getTime() > nowMs) open += 1;
    const submission = marksByAssignment.get(assignment.id);
    if (!submission) continue;
    if (submission.marks === null) ungraded += 1;
    else obtained += submission.marks;
  }
  // Compared without rounding: obtained / max >= min% (no assignments: nothing to score).
  const marksMet = max === 0 ? true : obtained * 100 >= criteria.minMarksPercent * max;

  // Attendance: classes that have started and were not cancelled.
  const held = input.sessions.filter((session) => session.status !== "CANCELLED" && session.startsAt.getTime() <= nowMs);
  const counted = held.filter((session) => session.attendanceTakenAt !== null);
  const presentSessions = new Set(input.attendance.filter((row) => row.present).map((row) => row.sessionId));
  const present = counted.filter((session) => presentSessions.has(session.id)).length;
  const attendanceMet = counted.length === 0 ? true : present * 100 >= criteria.minAttendancePercent * counted.length;

  const projectStatus = input.project?.status ?? null;
  const projectMet = !criteria.finalProjectRequired || projectStatus === "PASSED";
  const demoPassed = input.demos.some((demo) => demo.result === "PASSED");
  const demoMet = !criteria.liveDemoRequired || demoPassed;

  return {
    marks: { obtained, max, percent: percentOf(obtained, max), ungraded, open, met: marksMet },
    attendance: {
      present,
      counted: counted.length,
      unmarked: held.length - counted.length,
      percent: percentOf(present, counted.length),
      met: attendanceMet,
    },
    project: { status: projectStatus, required: criteria.finalProjectRequired, met: projectMet },
    demo: { passed: demoPassed, required: criteria.liveDemoRequired, met: demoMet },
    allMet: marksMet && attendanceMet && projectMet && demoMet,
    criteria,
  };
}

/** Whether a batch has ended: marked completed, or its end date (end of day, India time) has passed. */
export function hasBatchEnded(batch: { status: string; endDate: Date | null }, now: Date): boolean {
  if (batch.status === "COMPLETED") return true;
  return batch.endDate !== null && now.getTime() > batch.endDate.getTime();
}

/**
 * Why a result cannot be recorded yet (empty when it can). Pass: every criterion met and the
 * record complete. Fail: the batch has ended, the record is complete and a criterion is not met.
 */
export function resultBlockers(
  result: "PASS" | "FAIL",
  progress: TrainingProgress,
  batch: { status: string; endDate: Date | null },
  now: Date
): string[] {
  const blockers: string[] = [];
  if (progress.attendance.unmarked > 0) {
    blockers.push(`Attendance has not been taken for ${progress.attendance.unmarked} class${progress.attendance.unmarked === 1 ? "" : "es"}.`);
  }
  if (progress.marks.ungraded > 0) {
    blockers.push(`${progress.marks.ungraded} submission${progress.marks.ungraded === 1 ? " is" : "s are"} not graded yet.`);
  }
  if (result === "PASS") {
    if (!progress.marks.met) blockers.push(`Marks are below ${progress.criteria.minMarksPercent}%.`);
    if (!progress.attendance.met) blockers.push(`Attendance is below ${progress.criteria.minAttendancePercent}%.`);
    if (!progress.project.met) blockers.push("The final project has not passed.");
    if (!progress.demo.met) blockers.push("No live demo has passed.");
  } else {
    if (!hasBatchEnded(batch, now)) blockers.push("A fail can be recorded only after the batch has ended.");
    if (progress.allMet) blockers.push("Every pass criterion is met; record a pass instead.");
  }
  return blockers;
}
