import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Prisma, Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const SITE = "https://careers.gara.test";

const {
  mockPrisma,
  mockTransition,
  mockSession,
  mockConnection,
  mockOutbox,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
    application: { findMany: vi.fn(), findFirst: vi.fn() },
    opening: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  mockTransition: vi.fn(),
  mockSession: { current: null as null | { user: { id: string; email: string; name: string } } },
  mockConnection: vi.fn(async () => undefined),
  mockOutbox: { scheduleOutboxFlush: vi.fn() },
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/site-url", () => ({
  getSiteUrl: () => SITE,
  absoluteUrl: (p: string) => `${SITE}${p.startsWith("/") ? p : `/${p}`}`,
}));
vi.mock("@/features/recruitment/services/recruitment-service", () => ({
  recruitmentService: { transitionApplicationStatus: (...args: unknown[]) => mockTransition(...args) },
}));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => mockSession.current) } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: () => mockConnection() };
});
vi.mock("@/infrastructure/email/outbox-dispatch", () => mockOutbox);

import {
  resolveApplicationSource,
  normalizeStoredAttribution,
  pickAttributionParams,
  toAttributionQuery,
  externalReferrerHost,
  describeApplicationSource,
  MAX_SOURCE_DETAIL_LENGTH,
} from "@/features/applications/source-tracking";
import {
  assembleHiringFunnel,
  buildHiringFunnelCsv,
  funnelStagesFor,
  hiringFunnelService,
  toPercent,
  type HiringFunnelRawData,
} from "@/features/reports/services/hiring-funnel-service";
import {
  bulkActionsService,
  BULK_SKIP_REASONS,
  MAX_BULK_APPLICATIONS,
} from "@/features/recruitment/services/bulk-actions-service";
import { bulkTransitionApplicationsAction } from "@/features/recruitment/bulk-actions";
import {
  BulkSelectionProvider,
  BulkSelectCheckbox,
  BulkSelectPageToggle,
  type BulkSelectableApplication,
} from "@/features/recruitment/components/bulk-selection";
import { BulkActionBar, commonMoveTargets } from "@/features/recruitment/components/bulk-action-bar";
import {
  buildJobPostingJsonLd,
  buildOpeningMetadata,
  serializeJsonLd,
  type PublicOpeningSeoInput,
} from "@/app/careers/_lib/seo";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { HiringFunnelFilters } from "@/features/reports/types";

const admin: AuthenticatedUser = { id: "admin-1", name: "Admin", email: "admin@gara.test", roles: [Role.ADMIN] };
const hr: AuthenticatedUser = { id: "hr-1", name: "Meera HR", email: "hr@gara.test", roles: [Role.HR] };
const manager: AuthenticatedUser = { id: "mgr-1", name: "Vikram", email: "mgr@gara.test", roles: [Role.MANAGER] };
const interviewer: AuthenticatedUser = { id: "int-1", name: "Ira", email: "int@gara.test", roles: [Role.INTERVIEWER] };
const candidate: AuthenticatedUser = { id: "cand-1", name: "Asha", email: "asha@gara.test", roles: [Role.CANDIDATE] };

function permissionRow(userId: string, overrides: Record<string, boolean>) {
  return {
    id: `perm-${userId}`,
    userId,
    canApplications: true,
    canOpenings: true,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: true,
    canAttendance: true,
    canLeave: true,
    canPayroll: false,
    canReports: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.current = null;
  mockPrisma.subAdminPermission.findUnique.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.opening.findMany.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Source tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("Application source normalization", () => {
  it("applies the precedence: explicit answer > URL source > CAREERS_PAGE", () => {
    expect(resolveApplicationSource({}).source).toBe("CAREERS_PAGE");
    expect(resolveApplicationSource({ utmSource: "LinkedIn" }).source).toBe("LINKEDIN");
    expect(resolveApplicationSource({ source: "referral", utmSource: "linkedin" }).source).toBe("REFERRAL");
    expect(resolveApplicationSource({ heardFrom: "COLLEGE", utmSource: "linkedin" }).source).toBe("COLLEGE");
    expect(resolveApplicationSource({ utmSource: "google_jobs_apply" }).source).toBe("GOOGLE_JOBS");
    expect(resolveApplicationSource({ utmSource: "instagram" }).source).toBe("SOCIAL_MEDIA");
  });

  it("treats unknown URL tokens as OTHER and tampered answers as no answer", () => {
    expect(resolveApplicationSource({ utmSource: "newsletter" }).source).toBe("OTHER");
    expect(resolveApplicationSource({ heardFrom: "HR_ADMIN", utmSource: "linkedin" }).source).toBe("LINKEDIN");
    expect(resolveApplicationSource({ heardFrom: ["LINKEDIN"] }).source).toBe("CAREERS_PAGE");
    // An unknown ?source= still lets a known utm_source decide.
    expect(resolveApplicationSource({ source: "partner-x", utmSource: "linkedin" }).source).toBe("LINKEDIN");
  });

  it("keeps a bounded plain-text detail of the utm values and referrer host", () => {
    const resolved = resolveApplicationSource({
      utmSource: "linkedin",
      utmCampaign: `<img src=x onerror="alert(1)">${"a".repeat(400)}`,
      referrerHost: "www.LinkedIn.com",
    });
    expect(resolved.sourceDetail).toMatch(/^utm_source=linkedin; utm_campaign=img src x onerror alert\(1\)/);
    expect(resolved.sourceDetail).not.toMatch(/[<>"=]{2}|[<>"]/);
    expect((resolved.sourceDetail ?? "").length).toBeLessThanOrEqual(MAX_SOURCE_DETAIL_LENGTH);
    expect(resolveApplicationSource({ utmSource: "x", referrerHost: "linkedin.com" }).sourceDetail).toBe(
      "utm_source=x; ref=linkedin.com"
    );
    expect(resolveApplicationSource({}).sourceDetail).toBeNull();
  });

  it("re-checks values before storage", () => {
    expect(normalizeStoredAttribution({ source: "ADMIN", sourceDetail: "<b>\u0000hi" })).toEqual({
      source: "CAREERS_PAGE",
      sourceDetail: "b hi",
    });
    expect(normalizeStoredAttribution(undefined)).toEqual({ source: "CAREERS_PAGE", sourceDetail: null });
    expect(normalizeStoredAttribution({ source: "LINKEDIN", sourceDetail: "x".repeat(300) }).sourceDetail).toHaveLength(200);
    expect(describeApplicationSource(null)).toBe("Not recorded");
    expect(describeApplicationSource("weird")).toBe("Other");
  });

  it("carries only sanitized campaign parameters between pages", () => {
    const params = pickAttributionParams({
      utm_source: ["linkedin", "ignored"],
      utm_campaign: "fall 2026",
      ref: "evil.com/<script>",
      other: "dropped",
    });
    expect(params).toEqual({ utm_source: "linkedin", utm_campaign: "fall 2026" });
    expect(toAttributionQuery(params)).toBe("?utm_source=linkedin&utm_campaign=fall+2026");
    expect(toAttributionQuery({})).toBe("");
    expect(externalReferrerHost("https://www.linkedin.com/feed/", SITE)).toBe("linkedin.com");
    expect(externalReferrerHost(`${SITE}/careers`, SITE)).toBeNull();
    expect(externalReferrerHost("not a url", SITE)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hiring funnel
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS_ALL: HiringFunnelFilters = { startDate: null, endDate: null, openingType: null, openingId: null };

/** Aggregates of a 7-application cohort (verified against PostgreSQL during development). */
const RAW_FIXTURE: HiringFunnelRawData = {
  stageStats: [
    { stage: "SUBMITTED", reached: 7, progressed: 5, current: 2 },
    { stage: "SCREENING", reached: 5, progressed: 3, current: 0 },
    { stage: "SHORTLISTED", reached: 3, progressed: 2, current: 0 },
    { stage: "INTERVIEW_SCHEDULED", reached: 2, progressed: 2, current: 0 },
    { stage: "INTERVIEWED", reached: 2, progressed: 2, current: 0 },
    { stage: "EVALUATION_SELECTED", reached: 1, progressed: 1, current: 0 },
    { stage: "OFFERED", reached: 1, progressed: 1, current: 0 },
    { stage: "OFFER_ACCEPTED", reached: 1, progressed: 1, current: 0 },
    { stage: "HIRED", reached: 2, progressed: 0, current: 2 },
    { stage: "REJECTED", reached: 2, progressed: 0, current: 1 },
  ],
  dropOffs: [
    { stage: "SCREENING", outcome: "REJECTED", count: 2 },
    { stage: "SHORTLISTED", outcome: "WITHDRAWN", count: 1 },
  ],
  stageDurations: [
    { stage: "SUBMITTED", averageDays: 1.2, samples: 5 },
    { stage: "OFFER_ACCEPTED", averageDays: 18.04, samples: 1 },
    { stage: "REJECTED", averageDays: 1, samples: 1 },
  ],
  timeToHire: [
    { openingType: "INTERNSHIP", hires: 1, averageDays: 17, medianDays: 17 },
    { openingType: "FULL_TIME", hires: 1, averageDays: 30, medianDays: 30 },
    { openingType: null, hires: 2, averageDays: 23.5, medianDays: 23.5 },
  ],
  sources: [
    { source: "LINKEDIN", applications: 3, shortlisted: 1, hired: 1 },
    { source: "CAREERS_PAGE", applications: 1, shortlisted: 0, hired: 0 },
    { source: "UNKNOWN", applications: 1, shortlisted: 1, hired: 0 },
    { source: "weird_code", applications: 1, shortlisted: 0, hired: 0 },
    { source: "REFERRAL", applications: 1, shortlisted: 1, hired: 1 },
  ],
  topOpenings: [
    { openingId: "o2", title: "=HYPERLINK(\"http://x\")", type: "FULL_TIME", department: "Eng", applications: 4, hired: 1 },
    { openingId: "o1", title: "Intern Dev", type: "INTERNSHIP", department: "Eng", applications: 3, hired: 1 },
  ],
};

function assemble(raw: HiringFunnelRawData = RAW_FIXTURE, filters: HiringFunnelFilters = FILTERS_ALL) {
  return assembleHiringFunnel(raw, {
    filters,
    periodLabel: "All time",
    generatedAt: new Date("2026-10-25T00:00:00Z"),
    openingOptions: [],
  });
}

describe("Hiring funnel math", () => {
  it("computes reach, conversion and drop-off per stage from the aggregates", () => {
    const report = assemble();
    expect(report.totalApplications).toBe(7);
    expect(report.totalHired).toBe(2);
    expect(report.totalRejected).toBe(2);
    expect(report.totalWithdrawn).toBe(1);
    expect(report.stages.map((s) => s.stage)).toEqual([
      "SUBMITTED",
      "SCREENING",
      "SHORTLISTED",
      "INTERVIEW_SCHEDULED",
      "INTERVIEWED",
      "EVALUATION_SELECTED",
      "OFFERED",
      "OFFER_ACCEPTED",
      "HIRED",
    ]);
    const screening = report.stages[1];
    expect(screening).toMatchObject({
      reached: 5,
      reachedPct: 71.4,
      progressed: 3,
      conversionPct: 60,
      rejected: 2,
      withdrawn: 0,
      dropOffPct: 40,
    });
    const shortlisted = report.stages[2];
    expect(shortlisted).toMatchObject({ withdrawn: 1, dropOffPct: 33.3, conversionPct: 66.7 });
    const hired = report.stages[8];
    expect(hired).toMatchObject({ reached: 2, conversionPct: null, progressed: 0, current: 2 });
    expect(report.stages[5].internshipOnly).toBe(true);
    expect(report.stages[0].averageDaysInStage).toBe(1.2);
    expect(report.stages[7].averageDaysInStage).toBe(18);
    expect(report.stages[2].averageDaysInStage).toBeNull();
  });

  it("reports time to hire overall and per opening type, and honest nulls without hires", () => {
    expect(assemble().timeToHire).toEqual([
      { group: "ALL", label: "All openings", hires: 2, medianDays: 23.5, averageDays: 23.5 },
      { group: "INTERNSHIP", label: "Internships", hires: 1, medianDays: 17, averageDays: 17 },
      { group: "FULL_TIME", label: "Full-time roles", hires: 1, medianDays: 30, averageDays: 30 },
    ]);
    const empty = assemble(
      { stageStats: [], dropOffs: [], stageDurations: [], timeToHire: [{ openingType: null, hires: 0, averageDays: null, medianDays: null }], sources: [], topOpenings: [] },
      { ...FILTERS_ALL, openingType: "FULL_TIME" }
    );
    expect(empty.totalApplications).toBe(0);
    expect(empty.timeToHire).toEqual([
      { group: "FULL_TIME", label: "Full-time roles", hires: 0, medianDays: null, averageDays: null },
    ]);
    expect(empty.stages.every((s) => s.reached === 0 && s.conversionPct === null)).toBe(true);
  });

  it("groups sources (unknown codes as Other, legacy rows as Not recorded) with hire rates", () => {
    const sources = assemble().sources;
    expect(sources[0]).toEqual({
      source: "LINKEDIN",
      label: "LinkedIn",
      applications: 3,
      shortlisted: 1,
      hired: 1,
      hireRatePct: 33.3,
    });
    expect(sources.find((s) => s.source === "OTHER")).toMatchObject({ applications: 1, label: "Other" });
    expect(sources.find((s) => s.source === "UNKNOWN")).toMatchObject({ label: "Not recorded" });
    expect(sources.find((s) => s.source === "REFERRAL")?.hireRatePct).toBe(100);
  });

  it("drops the internship-only evaluation stage for full-time openings", () => {
    expect(funnelStagesFor("FULL_TIME")).not.toContain("EVALUATION_SELECTED");
    expect(funnelStagesFor("INTERNSHIP")).toContain("EVALUATION_SELECTED");
    expect(toPercent(1, 3)).toBe(33.3);
    expect(toPercent(0, 0)).toBeNull();
  });

  it("exports a tidy CSV with the formula-injection guard on every cell", () => {
    const { csvContent, rowCount } = buildHiringFunnelCsv(assemble());
    const lines = csvContent.split("\n");
    expect(lines[0]).toBe("Section,Item,Metric,Value");
    expect(lines).toHaveLength(rowCount + 1);
    expect(csvContent).toContain(`Top openings,"'=HYPERLINK(""http://x"")",Applications,4`);
    expect(csvContent).toContain("Stage funnel,Screening,Moved forward %,60");
    expect(csvContent).toContain("Time to hire,All openings,Median days,23.5");
    expect(csvContent).not.toMatch(/(^|,)=/m);
  });
});

/** Rebuilds the SQL of a `$queryRaw` tagged-template call. */
function sqlOfCall(call: unknown[]): Prisma.Sql {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return Prisma.sql(strings, ...values);
}

function mockFunnelQueries() {
  mockPrisma.$queryRaw.mockResolvedValue([]);
}

describe("Hiring funnel service: permissions, validation and parameterized SQL", () => {
  it("requires canReports and never queries for candidates or revoked staff", async () => {
    mockFunnelQueries();
    await expect(hiringFunnelService.getHiringFunnel(candidate, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(hiringFunnelService.getHiringFunnel(interviewer, {})).rejects.toBeInstanceOf(ForbiddenError);
    mockPrisma.subAdminPermission.findUnique.mockResolvedValueOnce(permissionRow(hr.id, { canReports: false }));
    await expect(hiringFunnelService.getHiringFunnel(hr, {})).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("runs only aggregate queries with every filter value bound as a parameter", async () => {
    mockFunnelQueries();
    const openingId = "5b0a4c1e-2f53-4a7e-9f1a-3d2c1b0a9e8f";
    const report = await hiringFunnelService.getHiringFunnel(manager, {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      openingType: "FULL_TIME",
      openingId,
    });

    expect(report.totalApplications).toBe(0);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(6);
    expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
    // The only row query is the bounded opening picker, selecting just what the form shows.
    expect(mockPrisma.opening.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.opening.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        select: { id: true, title: true, type: true, status: true },
      })
    );
    for (const call of mockPrisma.$queryRaw.mock.calls) {
      const sql = sqlOfCall(call);
      expect(sql.text).toMatch(/GROUP BY/);
      expect(sql.text).not.toContain(openingId);
      expect(sql.values).toContain(openingId);
      expect(sql.values).toContain("FULL_TIME");
      // The range is the business day (Asia/Kolkata) expressed in UTC, end exclusive.
      expect(sql.values).toContain("2026-09-30 18:30:00.000");
      expect(sql.values).toContain("2026-10-31 18:30:00.000");
    }
    expect(report.filters).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      openingType: "FULL_TIME",
      openingId,
    });
  });

  it("rejects invalid filters with friendly validation errors", async () => {
    mockFunnelQueries();
    await expect(
      hiringFunnelService.getHiringFunnel(admin, { startDate: "2026-11-01", endDate: "2026-10-01" })
    ).rejects.toThrow("The start date must be on or before the end date.");
    await expect(hiringFunnelService.getHiringFunnel(admin, { startDate: "2026-02-31" })).rejects.toThrow(
      "Start date must be a valid date (YYYY-MM-DD)."
    );
    await expect(
      hiringFunnelService.getHiringFunnel(admin, { openingType: "PAYROLL" as never })
    ).rejects.toThrow("Choose an opening type from the list.");
    await expect(
      hiringFunnelService.getHiringFunnel(admin, { openingId: "1; DROP TABLE applications" })
    ).rejects.toThrow("Choose an opening from the list.");
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("audits funnel CSV exports", async () => {
    mockFunnelQueries();
    const result = await hiringFunnelService.exportHiringFunnelCsv(admin, {});
    expect(result.fileName).toMatch(/^gara-hiring-funnel-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "EXPORT_REPORT", resourceId: "HIRING_FUNNEL", actorId: admin.id }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bulk actions
// ─────────────────────────────────────────────────────────────────────────────

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function record(n: number, status: string, candidateUserId = `cand-${n}`) {
  return {
    id: ID(n),
    referenceCode: `GARA-2026-APP-00000${n}`,
    status,
    candidate: { user: { id: candidateUserId, name: `Candidate ${n}` } },
  };
}

describe("Bulk stage actions", () => {
  it("delegates each valid application to transitionApplicationStatus and skips the rest with reasons", async () => {
    mockPrisma.application.findMany.mockResolvedValue([
      record(1, "SCREENING"),
      record(2, "SUBMITTED"),
      record(3, "SCREENING", hr.id),
      record(4, "SHORTLISTED"),
      record(6, "SCREENING"),
      record(7, "SCREENING"),
    ]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockTransition.mockImplementation(async (_user: AuthenticatedUser, input: { applicationId: string }) => {
      if (input.applicationId === ID(6)) throw new ConflictError("stage changed");
      if (input.applicationId === ID(7)) throw new Error("connect ECONNREFUSED db:5432");
      return { applicationId: input.applicationId, notificationQueued: true };
    });

    const summary = await bulkActionsService.transitionApplications(hr, {
      applicationIds: [ID(1), ID(2), ID(3), ID(4), ID(5), ID(6), ID(7), ID(1)],
      toStatus: "SHORTLISTED",
      sendEmail: true,
      candidateMessage: "  Good news!  ",
      internalNotes: "Batch screen",
    });
    consoleError.mockRestore();

    expect(summary).toMatchObject({ requested: 7, moved: 1, skipped: 6, emailsQueued: 1 });
    const reasons = Object.fromEntries(summary.items.map((item) => [item.applicationId, item.reason ?? item.outcome]));
    expect(reasons[ID(1)]).toBe("MOVED");
    expect(reasons[ID(2)]).toBe("Can't move from Submitted to Shortlisted.");
    expect(reasons[ID(3)]).toBe(BULK_SKIP_REASONS.OWN_APPLICATION);
    expect(reasons[ID(4)]).toBe("Already in Shortlisted.");
    expect(reasons[ID(5)]).toBe(BULK_SKIP_REASONS.NOT_FOUND);
    expect(reasons[ID(6)]).toBe(BULK_SKIP_REASONS.CHANGED);
    expect(reasons[ID(7)]).toBe(BULK_SKIP_REASONS.FAILED);
    expect(JSON.stringify(summary)).not.toContain("ECONNREFUSED");

    // Only applications passing the pre-checks reach the single-transition service.
    expect(mockTransition).toHaveBeenCalledTimes(3);
    expect(mockTransition).toHaveBeenCalledWith(hr, {
      applicationId: ID(1),
      toStatus: "SHORTLISTED",
      internalNotes: "Batch screen",
      candidateMessage: "Good news!",
    });
    // Records are loaded in one query, limited to what the user may see.
    expect(mockPrisma.application.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.application.findMany.mock.calls[0][0].where).toMatchObject({
      id: { in: [ID(1), ID(2), ID(3), ID(4), ID(5), ID(6), ID(7)] },
      AND: [{ AND: [{ candidate: { userId: { not: hr.id } } }] }],
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "BULK_TRANSITION_APPLICATION_STAGE",
          diffPayload: expect.objectContaining({ movedIds: [ID(1)], emailRequested: true }),
        }),
      })
    );
  });

  it("never sends a candidate message when the email option is off", async () => {
    mockPrisma.application.findMany.mockResolvedValue([record(1, "SUBMITTED")]);
    mockTransition.mockResolvedValue({ applicationId: ID(1), notificationQueued: false });
    const summary = await bulkActionsService.transitionApplications(admin, {
      applicationIds: [ID(1)],
      toStatus: "REJECTED",
      sendEmail: false,
      candidateMessage: "should not be sent",
    });
    expect(summary.emailsQueued).toBe(0);
    expect(mockTransition).toHaveBeenCalledWith(admin, expect.objectContaining({ candidateMessage: null }));
  });

  it("enforces the 100-application limit, input validation and workflow-owned stages", async () => {
    const tooMany = Array.from({ length: MAX_BULK_APPLICATIONS + 1 }, (_, i) => ID(i + 1));
    await expect(
      bulkActionsService.transitionApplications(hr, { applicationIds: tooMany, toStatus: "SCREENING" })
    ).rejects.toThrow(`You can update up to ${MAX_BULK_APPLICATIONS} applications at a time.`);
    await expect(
      bulkActionsService.transitionApplications(hr, { applicationIds: ["not-a-uuid"], toStatus: "SCREENING" })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      bulkActionsService.transitionApplications(hr, { applicationIds: [ID(1)], toStatus: "OFFERED" })
    ).rejects.toThrow(/own workflow/);
    await expect(
      bulkActionsService.transitionApplications(hr, {
        applicationIds: [ID(1)],
        toStatus: "SCREENING",
        sendEmail: true,
        candidateMessage: "   ",
      })
    ).rejects.toThrow("Write the message to send to candidates, or turn off the email.");
    expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it("requires a decision role with canApplications", async () => {
    const input = { applicationIds: [ID(1)], toStatus: "SCREENING" as const };
    await expect(bulkActionsService.transitionApplications(interviewer, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(bulkActionsService.transitionApplications(manager, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(bulkActionsService.transitionApplications(candidate, input)).rejects.toBeInstanceOf(ForbiddenError);
    mockPrisma.subAdminPermission.findUnique.mockResolvedValueOnce(permissionRow(hr.id, { canApplications: false }));
    await expect(bulkActionsService.transitionApplications(hr, input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
  });

  it("previews the candidate email only for an application the user may see", async () => {
    mockPrisma.application.findFirst.mockResolvedValueOnce({
      referenceCode: "GARA-2026-APP-ABC123",
      opening: { title: "Frontend Intern" },
      candidate: { user: { name: "Asha" } },
    });
    const preview = await bulkActionsService.previewStageUpdateEmail(hr, {
      applicationId: ID(1),
      toStatus: "SHORTLISTED",
      candidateMessage: "See you soon",
    });
    expect(preview.subject).toContain("GARA-2026-APP-ABC123");
    expect(preview.text).toContain("See you soon");
    expect(preview.text).toContain("Hello Asha");

    mockPrisma.application.findFirst.mockResolvedValueOnce(null);
    await expect(
      bulkActionsService.previewStageUpdateEmail(hr, { applicationId: ID(2), toStatus: "SHORTLISTED", candidateMessage: "x" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Server Action: authenticates, flushes queued emails and returns friendly errors", async () => {
    const unauthenticated = await bulkTransitionApplicationsAction({ applicationIds: [ID(1)], toStatus: "SCREENING" });
    expect(unauthenticated).toEqual({ success: false, error: "You must be logged in to access this resource" });

    mockSession.current = { user: { id: hr.id, email: hr.email, name: hr.name } };
    mockPrisma.user.findUnique.mockResolvedValue({ mustChangePassword: false, roles: [{ role: Role.HR }] });
    mockPrisma.application.findMany.mockResolvedValue([record(1, "SUBMITTED")]);
    mockTransition.mockResolvedValue({ applicationId: ID(1), notificationQueued: true });

    const result = await bulkTransitionApplicationsAction({
      applicationIds: [ID(1)],
      toStatus: "SCREENING",
      sendEmail: true,
      candidateMessage: "Hello",
    });
    expect(result).toMatchObject({ success: true, data: { moved: 1, emailsQueued: 1 } });
    expect(mockOutbox.scheduleOutboxFlush).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/applications", "layout");

    const invalid = await bulkTransitionApplicationsAction({ applicationIds: [], toStatus: "SCREENING" });
    expect(invalid).toEqual({ success: false, error: "Select at least one application." });
  });

  it("offers only stages valid for every selected application", () => {
    const items: BulkSelectableApplication[] = [
      { id: "a", referenceCode: "A", candidateName: "A", status: "SCREENING", manualTargets: ["SHORTLISTED", "REJECTED", "WITHDRAWN"] },
      { id: "b", referenceCode: "B", candidateName: "B", status: "SUBMITTED", manualTargets: ["SCREENING", "REJECTED", "WITHDRAWN"] },
    ];
    expect(commonMoveTargets(items)).toEqual(["WITHDRAWN"]);
    expect(commonMoveTargets([items[0]])).toEqual(["SHORTLISTED", "WITHDRAWN"]);
    expect(commonMoveTargets([])).toEqual([]);
  });

  it("selects a page of applications and shows the sticky action bar with the count", () => {
    const items: BulkSelectableApplication[] = [
      { id: ID(1), referenceCode: "R1", candidateName: "One", status: "SCREENING", manualTargets: ["SHORTLISTED", "REJECTED"] },
      { id: ID(2), referenceCode: "R2", candidateName: "Two", status: "SCREENING", manualTargets: ["SHORTLISTED", "REJECTED"] },
    ];
    render(
      React.createElement(
        BulkSelectionProvider,
        // Children are passed as createElement arguments below.
        { items } as React.ComponentProps<typeof BulkSelectionProvider>,
        React.createElement(BulkSelectPageToggle),
        React.createElement(BulkSelectCheckbox, { applicationId: ID(1), label: "Select R1 (One)" }),
        React.createElement(BulkSelectCheckbox, { applicationId: ID(2), label: "Select R2 (Two)" }),
        React.createElement(BulkActionBar)
      )
    );
    expect(screen.queryByRole("region", { name: /Bulk actions/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("Select R1 (One)"));
    expect(screen.getByText("1 application selected")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Select all on this page/));
    expect(screen.getByText("2 applications selected")).toBeTruthy();
    const select = screen.getByLabelText("Move to stage") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["SHORTLISTED"]);
    fireEvent.click(screen.getByText("Clear selection"));
    expect(screen.queryByRole("region", { name: /Bulk actions/ })).toBeNull();
    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Google Jobs SEO
// ─────────────────────────────────────────────────────────────────────────────

const baseOpening: PublicOpeningSeoInput = {
  title: "Frontend Intern",
  slug: "frontend-intern",
  description: "Build <script>alert(1)</script> UIs & more.\n\nSecond paragraph.",
  requirements: "React",
  responsibilities: null,
  department: "Engineering",
  type: "INTERNSHIP",
  location: "Pune, Maharashtra, India",
  workplaceType: "ON_SITE",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-05T10:00:00Z"),
};

describe("Google Jobs structured data and metadata", () => {
  it("builds a JobPosting from real opening data only", () => {
    const jsonLd = buildJobPostingJsonLd(baseOpening);
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Frontend Intern",
      datePosted: "2026-10-01",
      employmentType: "INTERN",
      directApply: true,
      url: `${SITE}/careers/frontend-intern`,
      hiringOrganization: {
        "@type": "Organization",
        name: "GARA Innovation",
        sameAs: SITE,
        logo: `${SITE}/brand/gara-logo.png`,
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Pune",
          addressRegion: "Maharashtra",
          addressCountry: "India",
        },
      },
    });
    expect(jsonLd).not.toHaveProperty("validThrough");
    expect(jsonLd).not.toHaveProperty("baseSalary");
    const description = String(jsonLd.description);
    expect(description).toContain("&lt;script&gt;alert(1)&lt;/script&gt; UIs &amp; more.");
    expect(description).not.toContain("<script");
    expect(description).toContain("<p>Second paragraph.</p>");
  });

  it("marks remote roles as TELECOMMUTE and adds validThrough only for a real close date", () => {
    const remote = buildJobPostingJsonLd({
      ...baseOpening,
      type: "FULL_TIME",
      workplaceType: "REMOTE",
      location: "India",
      closesAt: new Date("2026-12-31T18:29:59Z"),
    });
    expect(remote).toMatchObject({
      employmentType: "FULL_TIME",
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "AdministrativeArea", name: "India" },
      validThrough: "2026-12-31T18:29:59.000Z",
    });
    expect(remote).not.toHaveProperty("jobLocation");
    const anywhere = buildJobPostingJsonLd({ ...baseOpening, workplaceType: "REMOTE", location: "Remote" });
    expect(anywhere).not.toHaveProperty("applicantLocationRequirements");
  });

  it("serializes JSON-LD without characters that could break out of the script tag", () => {
    const value = { name: "</script><script>alert('x')</script>", note: "a & b > c", line: "x\u2028y" };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toMatch(/[<>&\u2028]/);
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(serialized)).toEqual(value);
  });

  it("sets the title, description, canonical URL and Open Graph for an opening", () => {
    const metadata = buildOpeningMetadata({ ...baseOpening, description: "x ".repeat(200) });
    expect(metadata.title).toBe("Frontend Intern");
    expect(metadata.alternates?.canonical).toBe(`${SITE}/careers/frontend-intern`);
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
    expect(metadata.openGraph).toMatchObject({ url: `${SITE}/careers/frontend-intern`, siteName: "GARA Innovation" });
  });

  it("uses dangerouslySetInnerHTML only for the escaped JSON-LD on the careers pages", () => {
    const careersDir = path.join(process.cwd(), "src/app/careers");
    const files = fs
      .readdirSync(careersDir, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"));
    const uses = files.flatMap((file) => {
      const content = fs.readFileSync(path.join(careersDir, file), "utf8");
      return content.includes("dangerouslySetInnerHTML") ? [{ file, content }] : [];
    });
    expect(uses.map((u) => u.file)).toEqual([path.join("[slug]", "page.tsx")]);
    expect(uses[0].content.match(/dangerouslySetInnerHTML/g)).toHaveLength(1);
    expect(uses[0].content).toContain("serializeJsonLd(buildJobPostingJsonLd(opening))");
  });
});

describe("sitemap.xml and robots.txt", () => {
  it("lists home, careers and only PUBLISHED openings, resolved at request time", async () => {
    mockPrisma.opening.findMany.mockResolvedValueOnce([
      { slug: "frontend-intern", updatedAt: new Date("2026-10-05T00:00:00Z") },
      { slug: "backend-engineer", updatedAt: new Date("2026-10-02T00:00:00Z") },
    ]);
    const entries = await sitemap();

    expect(mockConnection).toHaveBeenCalled();
    expect(mockPrisma.opening.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } })
    );
    expect(entries.map((e) => e.url)).toEqual([
      `${SITE}/`,
      `${SITE}/careers`,
      `${SITE}/careers/frontend-intern`,
      `${SITE}/careers/backend-engineer`,
    ]);
    expect(entries[1].lastModified).toEqual(new Date("2026-10-05T00:00:00Z"));
    expect(entries[2].lastModified).toEqual(new Date("2026-10-05T00:00:00Z"));
    const privatePrefixes = ["/admin", "/subadmin", "/candidate", "/intern", "/hrms", "/api", "/login", "/verify"];
    for (const entry of entries) {
      const pathname = new URL(entry.url).pathname;
      expect(privatePrefixes.some((prefix) => pathname.startsWith(prefix))).toBe(false);
      expect(pathname.endsWith("/apply")).toBe(false);
    }
  });

  it("allows public pages, disallows private areas and points to the sitemap", async () => {
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules).toHaveLength(1);
    const rule = rules[0];
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toEqual(["/", "/careers"]);
    const disallow = rule.disallow as string[];
    for (const privatePath of [
      "/admin",
      "/subadmin",
      "/candidate",
      "/intern",
      "/hrms",
      "/api",
      "/login",
      "/register",
      "/set-password",
      "/verify",
      "/careers/*/apply",
    ]) {
      expect(disallow).toContain(privatePath);
    }
    expect(result.sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});
