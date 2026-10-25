/** Durable job types run by the automation runner (see registry.ts for handlers). */
export const JOB_TYPES = {
  /** Precise-time reminder for one interview (24 hours and 1 hour before). */
  INTERVIEW_REMINDER: "INTERVIEW_REMINDER",
  /** Daily: interns with a pending checkpoint today; supervisors with checkpoints awaiting review. */
  CHECKPOINT_REMINDERS_DAILY: "CHECKPOINT_REMINDERS_DAILY",
  /** Daily: conversion reviews due within 7 days, due today or overdue. */
  CONVERSION_REVIEW_REMINDERS_DAILY: "CONVERSION_REVIEW_REMINDERS_DAILY",
  /** Daily: one digest per staff member of the actions waiting for them. */
  STAFF_DAILY_DIGEST: "STAFF_DAILY_DIGEST",
  /** Applies an accepted intern-to-full-time conversion on its effective date. */
  CONVERSION_EFFECTIVE: "CONVERSION_EFFECTIVE",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
