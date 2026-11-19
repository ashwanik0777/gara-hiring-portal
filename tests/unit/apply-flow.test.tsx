import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

const { mockPrisma, mockGuards, mockRateLimiter } = vi.hoisted(() => ({
  mockPrisma: {
    college: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockGuards: { getCurrentUser: vi.fn(), assertPermission: vi.fn(), requirePermission: vi.fn() },
  mockRateLimiter: { enforce: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/guards", () => mockGuards);
vi.mock("@/lib/security/rate-limit", () => ({
  defaultRateLimiter: mockRateLimiter,
  RATE_LIMIT_POLICIES: { COLLEGE_SEARCH: { scope: "portal:college_search", maxRequests: 60, windowSeconds: 60 } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { NextRequest } from "next/server";
import { GET as collegeSearchRoute } from "@/app/api/colleges/route";
import {
  APPLICANT_DETAIL_FIELDS,
  applicantDetailIssues,
  applicantDetailsSchema,
  graduationYearOptions,
  missingApplicantDetails,
  readApplicantDetails,
} from "@/features/applications/applicant-details";
import { cleanCollegeName, normalizeCollegeName } from "@/features/colleges/college-name";
import { resolveCollegeChoice, searchColleges, updateCollege } from "@/features/colleges/services/college-service";
import { ApplicantDetailsFields } from "@/features/applications/components/applicant-details-fields";
import { ConflictError, RateLimitError, ValidationError } from "@/lib/errors";
import { Role, type Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const STUDENT: AuthenticatedUser = { id: "student-1", email: "s@example.test", name: "Student", roles: [Role.CANDIDATE] };
const ADMIN: AuthenticatedUser = { id: "admin-1", email: "a@example.test", name: "Admin", roles: [Role.ADMIN] };
const tx = mockPrisma as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (client: typeof mockPrisma) => unknown) => cb(mockPrisma));
  mockRateLimiter.enforce.mockResolvedValue({ allowed: true, remaining: 59, retryAfterSeconds: 0 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("college names", () => {
  it("treats spacing, case and punctuation as the same college", () => {
    expect(normalizeCollegeName("I.I.T.  Delhi")).toBe("i i t delhi");
    expect(normalizeCollegeName("  Example   Institute of Technology ")).toBe("example institute of technology");
    expect(normalizeCollegeName("St. Xavier's College")).toBe("st xavier s college");
    expect(normalizeCollegeName("Science & Arts")).toBe("science & arts");
    expect(cleanCollegeName("  Example   Institute ")).toBe("Example Institute");
  });
});

describe("applicant details", () => {
  function form(entries: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.append(key, value);
    return data;
  }

  it("reads the form fields and requires consent", () => {
    const parsed = applicantDetailsSchema.safeParse(
      readApplicantDetails(
        form({
          [APPLICANT_DETAIL_FIELDS.collegeName]: "  Example   Institute ",
          [APPLICANT_DETAIL_FIELDS.branch]: "CSE",
          [APPLICANT_DETAIL_FIELDS.yearOfStudy]: "3",
          [APPLICANT_DETAIL_FIELDS.graduationYear]: "2027",
          [APPLICANT_DETAIL_FIELDS.consent]: "on",
        })
      )
    );
    expect(parsed.success && parsed.data).toEqual({
      collegeId: null,
      collegeName: "Example Institute",
      branch: "CSE",
      yearOfStudy: 3,
      graduationYear: 2027,
      consent: true,
    });

    const withoutConsent = applicantDetailsSchema.safeParse(readApplicantDetails(form({})));
    expect(withoutConsent.success).toBe(false);
    if (!withoutConsent.success) {
      expect(applicantDetailIssues(withoutConsent.error)).toEqual([
        { field: APPLICANT_DETAIL_FIELDS.consent, message: "Please accept the Privacy Policy and Terms of Service to apply." },
      ]);
    }
  });

  it("rejects tampered values (not a number, out of range, not a uuid)", () => {
    const parsed = applicantDetailsSchema.safeParse(
      readApplicantDetails(
        form({
          [APPLICANT_DETAIL_FIELDS.collegeId]: "1; DROP TABLE colleges",
          [APPLICANT_DETAIL_FIELDS.yearOfStudy]: "9",
          [APPLICANT_DETAIL_FIELDS.graduationYear]: "20x7",
          [APPLICANT_DETAIL_FIELDS.consent]: "on",
        })
      )
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = applicantDetailIssues(parsed.error).map((issue) => issue.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          APPLICANT_DETAIL_FIELDS.collegeName,
          APPLICANT_DETAIL_FIELDS.yearOfStudy,
          APPLICANT_DETAIL_FIELDS.graduationYear,
        ])
      );
    }
  });

  it("needs college and graduation year for internships only", () => {
    const empty = { collegeId: null, collegeName: null, branch: null, yearOfStudy: null, graduationYear: null, consent: true as const };
    expect(missingApplicantDetails(empty, "INTERNSHIP").map((issue) => issue.field)).toEqual([
      APPLICANT_DETAIL_FIELDS.collegeName,
      APPLICANT_DETAIL_FIELDS.graduationYear,
    ]);
    expect(missingApplicantDetails(empty, "FULL_TIME")).toEqual([]);
  });

  it("offers graduation years around the current year", () => {
    const years = graduationYearOptions(2026);
    expect(years[0]).toBe(2032);
    expect(years.at(-1)).toBe(2016);
  });
});

describe("college search and choice", () => {
  it("searches approved colleges and the student's own pending ones only", async () => {
    mockPrisma.college.findMany.mockResolvedValue([]);
    await searchColleges("  iit ", STUDENT.id);
    expect(mockPrisma.college.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: { contains: "iit", mode: "insensitive" },
          OR: [{ status: "APPROVED" }, { createdById: STUDENT.id }],
        },
        take: 10,
      })
    );
    expect(await searchColleges("a", STUDENT.id)).toEqual([]);
  });

  it("reuses the row of a typed name, or adds it pending approval", async () => {
    mockPrisma.college.upsert.mockResolvedValue({ id: "college-7" });
    await expect(resolveCollegeChoice(tx, { collegeName: "Example  Institute" }, STUDENT.id)).resolves.toBe("college-7");
    expect(mockPrisma.college.upsert).toHaveBeenCalledWith({
      where: { normalizedName: "example institute" },
      update: {},
      create: { name: "Example Institute", normalizedName: "example institute", status: "PENDING", createdById: STUDENT.id },
      select: { id: true },
    });
  });

  it("accepts a picked college only when approved or the student's own", async () => {
    mockPrisma.college.findUnique.mockResolvedValueOnce({ id: "c-1", status: "APPROVED", createdById: null });
    await expect(resolveCollegeChoice(tx, { collegeId: "c-1" }, STUDENT.id)).resolves.toBe("c-1");

    mockPrisma.college.findUnique.mockResolvedValueOnce({ id: "c-2", status: "PENDING", createdById: STUDENT.id });
    await expect(resolveCollegeChoice(tx, { collegeId: "c-2" }, STUDENT.id)).resolves.toBe("c-2");

    mockPrisma.college.findUnique.mockResolvedValueOnce({ id: "c-3", status: "PENDING", createdById: "other" });
    await expect(resolveCollegeChoice(tx, { collegeId: "c-3" }, STUDENT.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a too-short typed name and returns null when nothing was given", async () => {
    await expect(resolveCollegeChoice(tx, { collegeName: "ab" }, STUDENT.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(resolveCollegeChoice(tx, {}, STUDENT.id)).resolves.toBeNull();
  });

  it("lets staff correct and approve a college, with an audit entry", async () => {
    mockPrisma.college.findUnique.mockResolvedValueOnce({ id: "c-4", status: "PENDING" });
    mockPrisma.college.update.mockResolvedValueOnce({ id: "c-4", status: "APPROVED" });
    await updateCollege("c-4", { name: " Example Institute ", city: "Pune", state: null, approve: true }, ADMIN);

    expect(mockGuards.assertPermission).toHaveBeenCalledWith(ADMIN, "canApplications");
    expect(mockPrisma.college.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Example Institute", normalizedName: "example institute", city: "Pune", state: null, status: "APPROVED" },
      })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "COLLEGE_APPROVED", resourceId: "c-4" }),
    });
  });

  it("reports a name clash with another college as a conflict", async () => {
    mockPrisma.college.findUnique.mockResolvedValueOnce({ id: "c-5", status: "PENDING" });
    mockPrisma.college.update.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(updateCollege("c-5", { name: "Example Institute", approve: false }, ADMIN)).rejects.toBeInstanceOf(
      ConflictError
    );
  });
});

describe("GET /api/colleges", () => {
  const request = (query: string) => new NextRequest(`http://localhost/api/colleges${query}`);

  it("requires a signed-in user", async () => {
    mockGuards.getCurrentUser.mockResolvedValue(null);
    const response = await collegeSearchRoute(request("?q=iit"));
    expect(response.status).toBe(401);
    expect(mockPrisma.college.findMany).not.toHaveBeenCalled();
  });

  it("answers short or long queries with no results and no database read", async () => {
    mockGuards.getCurrentUser.mockResolvedValue(STUDENT);
    expect(await (await collegeSearchRoute(request("?q=a"))).json()).toEqual({ colleges: [] });
    expect(await (await collegeSearchRoute(request(`?q=${"x".repeat(61)}`))).json()).toEqual({ colleges: [] });
    expect(mockPrisma.college.findMany).not.toHaveBeenCalled();
  });

  it("returns suggestions, never cached, and is rate-limited per user", async () => {
    mockGuards.getCurrentUser.mockResolvedValue(STUDENT);
    mockPrisma.college.findMany.mockResolvedValue([{ id: "c-1", name: "Example Institute", city: null, state: null }]);
    const response = await collegeSearchRoute(request("?q=exam"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ colleges: [{ id: "c-1", name: "Example Institute", city: null, state: null }] });
    expect(mockRateLimiter.enforce).toHaveBeenCalledWith(STUDENT.id, expect.objectContaining({ scope: "portal:college_search" }));

    mockRateLimiter.enforce.mockRejectedValueOnce(new RateLimitError(30));
    const limited = await collegeSearchRoute(request("?q=exam"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("30");
  });
});

describe("applicant details fields", () => {
  const defaults = { college: null, branch: null, yearOfStudy: null, graduationYear: null };

  it("marks college and graduation year required for internships, consent always", () => {
    render(<ApplicantDetailsFields defaults={defaults} isInternship currentYear={2026} />);
    expect(screen.getByLabelText("College / University *").hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText("Graduation year *").hasAttribute("required")).toBe(true);
    expect(screen.getByRole("checkbox", { name: /I have read and agree/ }).hasAttribute("required")).toBe(true);
    cleanup();

    render(<ApplicantDetailsFields defaults={defaults} isInternship={false} currentYear={2026} />);
    expect(screen.getByLabelText("College / University").hasAttribute("required")).toBe(false);
    expect(screen.getByRole("checkbox", { name: /I have read and agree/ }).hasAttribute("required")).toBe(true);
  });

  it("prefills the saved details", () => {
    const { container } = render(
      <ApplicantDetailsFields
        defaults={{ college: { id: "c-1", name: "Example Institute" }, branch: "CSE", yearOfStudy: 3, graduationYear: 2027 }}
        isInternship
        currentYear={2026}
      />
    );
    expect((screen.getByLabelText("College / University *") as HTMLInputElement).value).toBe("Example Institute");
    expect((container.querySelector(`input[name="${APPLICANT_DETAIL_FIELDS.collegeId}"]`) as HTMLInputElement).value).toBe("c-1");
    expect((screen.getByLabelText("Graduation year *") as HTMLSelectElement).value).toBe("2027");
  });

  it("suggests colleges while typing and sends the picked one's id", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ colleges: [{ id: "c-9", name: "Example Institute of Technology", city: "Pune", state: null }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ApplicantDetailsFields defaults={defaults} isInternship currentYear={2026} />);
    const input = screen.getByLabelText("College / University *");

    fireEvent.change(input, { target: { value: "exam" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/colleges?q=exam", expect.anything());

    const option = screen.getByRole("option", { name: /Example Institute of Technology/ });
    fireEvent.mouseDown(option);
    expect((input as HTMLInputElement).value).toBe("Example Institute of Technology");
    expect((container.querySelector(`input[name="${APPLICANT_DETAIL_FIELDS.collegeId}"]`) as HTMLInputElement).value).toBe("c-9");
    expect((container.querySelector(`input[name="${APPLICANT_DETAIL_FIELDS.collegeName}"]`) as HTMLInputElement).value).toBe("");
  });

  it("sends a typed, unlisted name for staff approval", () => {
    const { container } = render(<ApplicantDetailsFields defaults={defaults} isInternship currentYear={2026} />);
    fireEvent.change(screen.getByLabelText("College / University *"), { target: { value: "New College of Arts" } });
    expect((container.querySelector(`input[name="${APPLICANT_DETAIL_FIELDS.collegeId}"]`) as HTMLInputElement).value).toBe("");
    expect((container.querySelector(`input[name="${APPLICANT_DETAIL_FIELDS.collegeName}"]`) as HTMLInputElement).value).toBe(
      "New College of Arts"
    );
  });
});
