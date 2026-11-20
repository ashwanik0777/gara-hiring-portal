import { z } from "zod";
import { rupeesToPaise } from "./money";

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} must have at least ${min} characters`)
    .max(max, `${label} can have at most ${max} characters`);

const optionalText = (label: string, max: number) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), text(label, 1, max).nullable().optional());

const dateKey = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
/** A local date-time from <input type="datetime-local">, interpreted in India time. */
const localDateTime = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time");

export const syllabusWeekSchema = z.object({
  week: z.number().int().min(1).max(104),
  title: text("Week title", 2, 120),
  topics: z.array(text("Topic", 1, 160)).max(20, "At most 20 topics per week"),
});

export type SyllabusWeek = z.infer<typeof syllabusWeekSchema>;

export const trainingProgramSchema = z.object({
  title: text("Title", 3, 150),
  slug: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and single hyphens"),
  trackId: z.union([z.uuid(), z.literal("")]).nullable().optional(),
  summary: text("Summary", 10, 300),
  description: text("Description", 20, 20_000),
  syllabus: z.array(syllabusWeekSchema).max(104),
  durationWeeks: z.number().int().min(1, "At least one week").max(104),
  /** Fee in rupees as typed; stored as paise. */
  feeRupees: z
    .union([z.string(), z.number()])
    .refine((value) => rupeesToPaise(value) !== null, "Enter the fee in rupees, e.g. 4999"),
  prerequisites: optionalText("Prerequisites", 2_000),
  outcomes: optionalText("Outcomes", 2_000),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

export type TrainingProgramInput = z.input<typeof trainingProgramSchema>;

export const trainingBatchSchema = z
  .object({
    programId: z.uuid(),
    name: text("Batch name", 2, 80),
    startDate: dateKey,
    firstClassAt: z.union([localDateTime, z.literal("")]).nullable().optional(),
    endDate: z.union([dateKey, z.literal("")]).nullable().optional(),
    scheduleText: optionalText("Schedule", 300),
    seats: z.number().int().min(1, "At least one seat").max(10_000),
    enrollmentDeadline: z.union([dateKey, z.literal("")]).nullable().optional(),
    status: z.enum(["UPCOMING", "RUNNING", "COMPLETED", "CANCELLED"]),
  })
  .refine((batch) => !batch.endDate || batch.endDate >= batch.startDate, {
    path: ["endDate"],
    message: "The end date must be on or after the start date",
  });

export type TrainingBatchInput = z.input<typeof trainingBatchSchema>;
