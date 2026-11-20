import { BUSINESS_TIME_ZONE, businessDateKey } from "@/lib/time/business-time";
import { paiseToRupeesInput } from "./money";
import type { StaffTrainingProgram } from "./services/program-service";
import type { ProgramFormValues } from "./components/program-form";
import type { BatchRow } from "./components/batch-manager";

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: BUSINESS_TIME_ZONE });

/** "YYYY-MM-DDTHH:MM" in India time, for <input type="datetime-local">. */
export function toLocalDateTimeInput(date: Date): string {
  return `${businessDateKey(date)}T${TIME.format(date)}`;
}

export function toProgramFormValues(program: StaffTrainingProgram): ProgramFormValues {
  return {
    title: program.title,
    slug: program.slug,
    trackId: program.trackId ?? "",
    summary: program.summary,
    description: program.description,
    durationWeeks: program.durationWeeks,
    feeRupees: paiseToRupeesInput(program.feePaise),
    prerequisites: program.prerequisites ?? "",
    outcomes: program.outcomes ?? "",
    status: program.status,
    syllabus: program.syllabus.length > 0 ? program.syllabus : [{ week: 1, title: "", topics: [] }],
  };
}

export function toBatchRows(program: StaffTrainingProgram): BatchRow[] {
  return program.batches.map((batch) => ({
    id: batch.id,
    name: batch.name,
    startDate: businessDateKey(batch.startDate),
    firstClassAt: batch.firstClassAt ? toLocalDateTimeInput(batch.firstClassAt) : "",
    endDate: batch.endDate ? businessDateKey(batch.endDate) : "",
    scheduleText: batch.scheduleText ?? "",
    seats: batch.seats,
    enrollmentDeadline: batch.enrollmentDeadline ? businessDateKey(batch.enrollmentDeadline) : "",
    status: batch.status,
    enrollments: batch._count.enrollments,
  }));
}
