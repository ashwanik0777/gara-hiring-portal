import { z } from "zod";
import { atBusinessTime } from "@/lib/time/business-time";

/*
 * Input validation for the Industrial Training learning area (Phase 3B). Client checks are UX
 * only; every action parses with these schemas on the server.
 */

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/** "YYYY-MM-DDTHH:MM" typed in India time → the instant. */
export function fromLocalDateTime(value: string): Date {
  const match = LOCAL_DATE_TIME.exec(value.trim());
  if (!match) throw new Error("Invalid local date-time");
  return atBusinessTime(match[1], Number(match[2]), Number(match[3]));
}

const localDateTime = z
  .string()
  .trim()
  .regex(LOCAL_DATE_TIME, "Enter a valid date and time")
  .refine((value) => !Number.isNaN(fromLocalDateTime(value).getTime()), "Enter a valid date and time");

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} must have at least ${min} characters`)
    .max(max, `${label} can have at most ${max} characters`);

/** An https link (GitHub, Drive, meeting); stored as typed after trimming. */
export const httpsUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(2048, `${label} is too long`)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && Boolean(url.hostname);
      } catch {
        return false;
      }
    }, `${label} must be a full https:// link`);

const optionalHttpsUrl = (label: string) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), httpsUrl(label).nullable().optional());

const optionalText = (label: string, max: number) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), text(label, 1, max).nullable().optional());

const id = z.uuid();

export const sessionSchema = z.object({
  batchId: id,
  title: text("Title", 2, 150),
  startsAt: localDateTime,
  durationMinutes: z.coerce.number().int().min(1, "At least 1 minute").max(600, "At most 600 minutes"),
  meetingUrl: optionalHttpsUrl("Meeting link"),
  recordingUrl: optionalHttpsUrl("Recording link"),
});

export const attendanceSchema = z.object({
  sessionId: id,
  entries: z.array(z.object({ enrollmentId: id, present: z.boolean() })).min(1).max(1000),
});

export const assignmentSchema = z.object({
  batchId: id,
  title: text("Title", 2, 150),
  description: text("Description", 5, 5000),
  dueAt: localDateTime,
  maxMarks: z.coerce.number().int().min(1, "At least 1 mark").max(1000, "At most 1,000 marks"),
});

export const submissionSchema = z
  .object({
    enrollmentId: id,
    assignmentId: id,
    repoUrl: optionalHttpsUrl("Repository link"),
    linkUrl: optionalHttpsUrl("Link"),
    notes: optionalText("Notes", 2000),
  })
  .refine((value) => Boolean(value.repoUrl || value.linkUrl), { path: ["repoUrl"], message: "Add a repository link or another link" });

export const gradeSchema = z.object({
  submissionId: id,
  marks: z.coerce.number().int("Whole marks only").min(0, "Marks cannot be negative"),
  feedback: optionalText("Feedback", 2000),
});

export const projectSchema = z.object({
  enrollmentId: id,
  title: text("Project title", 3, 150),
  description: optionalText("Description", 2000),
  repoUrl: httpsUrl("Repository link"),
  liveUrl: optionalHttpsUrl("Live link"),
});

export const projectReviewSchema = z
  .object({
    projectId: id,
    status: z.enum(["PASSED", "CHANGES_REQUESTED", "FAILED"]),
    marks: z.preprocess((value) => (value === "" || value === null || value === undefined ? null : value), z.coerce.number().int().min(0).max(100).nullable()),
    feedback: optionalText("Feedback", 2000),
  })
  .refine((value) => value.status === "PASSED" || Boolean(value.feedback && value.feedback.length >= 5), {
    path: ["feedback"],
    message: "Tell the student what to change (at least 5 characters)",
  });

export const demoSlotsSchema = z.object({
  batchId: id,
  startsAt: z.array(localDateTime).min(1, "Add at least one slot").max(30, "At most 30 slots at a time"),
  durationMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(240, "At most 240 minutes"),
  meetingUrl: optionalHttpsUrl("Meeting link"),
});

export const demoResultSchema = z.object({
  slotId: id,
  result: z.enum(["PASSED", "FAILED"]),
  note: optionalText("Note", 1000),
});

export const resultDecisionSchema = z
  .object({
    enrollmentId: id,
    result: z.enum(["PASS", "FAIL"]),
    note: optionalText("Note", 1000),
    signatoryName: optionalText("Signatory name", 120),
    signatoryTitle: optionalText("Signatory title", 120),
    secondSignatoryName: optionalText("Second signatory name", 120),
    secondSignatoryTitle: optionalText("Second signatory title", 120),
    grade: optionalText("Grade", 40),
  })
  .refine((value) => value.result === "FAIL" || Boolean(value.signatoryName && value.signatoryTitle), {
    path: ["signatoryName"],
    message: "The certificate needs the signatory's name and title",
  })
  .refine((value) => value.result === "PASS" || Boolean(value.note && value.note.length >= 5), {
    path: ["note"],
    message: "Tell the student why (at least 5 characters)",
  })
  .refine((value) => Boolean(value.secondSignatoryName) === Boolean(value.secondSignatoryTitle), {
    path: ["secondSignatoryName"],
    message: "Enter both the name and the title of the second signatory, or neither",
  });

export type SessionInput = z.input<typeof sessionSchema>;
export type AssignmentInput = z.input<typeof assignmentSchema>;
export type ResultDecisionInput = z.input<typeof resultDecisionSchema>;
