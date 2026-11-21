import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvaluationStatus, Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Evaluations list: four summary cards built from the same database status counts as the
// filter chips, each linking to its filter; no description lines under empty states.
// ---------------------------------------------------------------------------

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/features/internship-evaluation/services/evaluation-service", () => ({
  evaluationService: { listEnrollmentsForStaff: mockList },
  FINAL_EVALUATION_OUTCOMES: ["PASSED", "FAILED"],
}));

import { EvaluationListSection } from "@/features/internship-evaluation/components/evaluation-portal-views";

const admin = { id: "admin-1", roles: [Role.ADMIN] } as unknown as AuthenticatedUser;
const access = {
  scope: "ALL",
  permissions: { canApplications: true },
} as unknown as Parameters<typeof EvaluationListSection>[0]["access"];
const paths = { evaluations: "/admin/evaluations", applications: "/admin/applications", employees: "/admin/employees" };

async function renderSection(status: EvaluationStatus | null = null) {
  const element = await EvaluationListSection({ user: admin, access, paths, status, page: 1 });
  const html = renderToStaticMarkup(element);
  document.body.innerHTML = html;
  return document.body;
}

/** The value and link of the stat card with this label. */
function card(root: HTMLElement, label: string) {
  const labelEl = Array.from(root.querySelectorAll("span")).find((el) => el.textContent === label);
  const link = labelEl?.closest("a");
  return { href: link?.getAttribute("href"), text: link?.textContent ?? "" };
}

beforeEach(() => {
  mockList.mockReset();
  document.body.innerHTML = "";
});

describe("evaluation summary cards", () => {
  it("shows total, in progress, under review and passed from the status counts, each linking to its filter", async () => {
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, pageCount: 1, statusCounts: { IN_PROGRESS: 3, UNDER_REVIEW: 2, PASSED: 4, FAILED: 1, EXTENDED: 1 } });
    // A status with no rows on the requested page still renders the cards (counts are scope-wide).
    const root = await renderSection(EvaluationStatus.PENDING_TRIGGER);
    expect(root.querySelector('[aria-label="Evaluation summary"]')).not.toBeNull();
    expect(card(root, "Total Evaluations")).toMatchObject({ href: "/admin/evaluations" });
    expect(card(root, "Total Evaluations").text).toContain("11");
    expect(card(root, "In Progress")).toMatchObject({ href: "/admin/evaluations?status=IN_PROGRESS" });
    expect(card(root, "In Progress").text).toContain("3");
    expect(card(root, "Under Review")).toMatchObject({ href: "/admin/evaluations?status=UNDER_REVIEW" });
    expect(card(root, "Under Review").text).toContain("2");
    expect(card(root, "Passed")).toMatchObject({ href: "/admin/evaluations?status=PASSED" });
    expect(card(root, "Passed").text).toContain("4");
  });

  it("shows zeros, not blanks, when nothing is in evaluation yet, and no description under the empty state", async () => {
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, pageCount: 1, statusCounts: {} });
    const root = await renderSection();
    for (const label of ["Total Evaluations", "In Progress", "Under Review", "Passed"]) {
      expect(card(root, label).text).toContain("0");
    }
    expect(root.textContent).toContain("No candidates in evaluation yet");
    expect(root.textContent).not.toContain("will appear here");
  });
});
