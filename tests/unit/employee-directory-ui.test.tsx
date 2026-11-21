import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Employees page: summary cards, status and type filters, the directory rows and the
// "Manage Employee" controls on the record.
// ---------------------------------------------------------------------------

const { db, actions } = vi.hoisted(() => ({
  db: { employee: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() } },
  actions: {
    updateEmployeeStatusAction: vi.fn(),
    assignEmployeeManagerAction: vi.fn(),
    processEmployeeExitAction: vi.fn(),
    searchReportingManagersAction: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/features/employees/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

import { employeeService } from "@/features/employees/services/employee-service";
import { EmployeeDirectoryTable, employeeInitials } from "@/features/employees/components/employee-directory-table";
import {
  employeeDirectoryHref,
  employeeDirectoryKey,
  parseEmployeeDirectoryParams,
  toDirectoryQuery,
  type EmployeeDirectoryParams,
} from "@/features/employees/components/employee-directory-params";
import { EmployeeLifecycleCard } from "@/features/employees/components/employee-lifecycle-card";
import type { EmployeeDirectoryPage, EmployeeDirectorySummary } from "@/features/employees/types";
import { ForbiddenError } from "@/lib/errors";

const admin = { id: "a1", email: "a@example.test", name: "Admin", roles: [Role.ADMIN] } as AuthenticatedUser;
const candidate = { id: "c1", email: "c@example.test", name: "C", roles: [Role.CANDIDATE] } as AuthenticatedUser;

const NO_FILTERS: EmployeeDirectoryParams = { q: "", department: "", status: null, type: null, page: 1 };

const SUMMARY: EmployeeDirectorySummary = {
  total: 9,
  byStatus: { ACTIVE: 5, PROBATION: 2, ON_LEAVE: 1, EXITED: 1 },
  byType: { FULL_TIME: 5, INTERN: 3 },
};

function page(items: EmployeeDirectoryPage["items"], total = items.length): EmployeeDirectoryPage {
  return { items, total, page: 1, pageSize: 25, pageCount: 1, departments: ["Design", "Engineering"] };
}

const LEAD = {
  id: "e2",
  employeeCode: "GARA-EMP-0002",
  name: "Test Engineering Lead",
  email: "lead@example.test",
  department: "Engineering",
  designation: "Engineering Manager",
  joiningDate: new Date("2026-09-22T00:00:00.000Z"),
  status: "ACTIVE" as const,
  employmentType: "FULL_TIME" as const,
  manager: { id: "e1", employeeCode: "GARA-EMP-0001", name: "Test Director", designation: "Director" },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("directory params", () => {
  it("reads and writes the employment type filter in the URL", () => {
    const params = parseEmployeeDirectoryParams({ type: "intern", status: "ACTIVE", q: " ana " });
    expect(params).toEqual({ q: "ana", department: "", status: "ACTIVE", type: "INTERN", page: 1 });
    expect(toDirectoryQuery(params)).toMatchObject({ employmentType: "INTERN", status: "ACTIVE", search: "ana" });
    expect(employeeDirectoryHref("/admin/employees", params)).toBe("/admin/employees?q=ana&status=ACTIVE&type=intern");
    expect(parseEmployeeDirectoryParams({ type: "contractor" }).type).toBeNull();
    expect(employeeDirectoryKey(params)).not.toBe(employeeDirectoryKey({ ...params, type: "FULL_TIME" }));
  });
});

describe("getEmployeeDirectorySummary", () => {
  it("adds up employees per status and employment type in one grouped query", async () => {
    db.employee.groupBy.mockResolvedValue([
      { status: "ACTIVE", employmentType: "FULL_TIME", _count: { _all: 4 } },
      { status: "ACTIVE", employmentType: "INTERN", _count: { _all: 1 } },
      { status: "PROBATION", employmentType: "FULL_TIME", _count: { _all: 1 } },
      { status: "EXITED", employmentType: "INTERN", _count: { _all: 2 } },
      { status: "ACTIVE", employmentType: null, _count: { _all: 1 } },
    ]);
    await expect(employeeService.getEmployeeDirectorySummary(admin)).resolves.toEqual({
      total: 9,
      byStatus: { ACTIVE: 6, PROBATION: 1, ON_LEAVE: 0, EXITED: 2 },
      byType: { FULL_TIME: 5, INTERN: 3 },
    });
    expect(db.employee.groupBy).toHaveBeenCalledWith({ by: ["status", "employmentType"], _count: { _all: true } });
  });

  it("needs the employees permission", async () => {
    await expect(employeeService.getEmployeeDirectorySummary(candidate)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.employee.groupBy).not.toHaveBeenCalled();
  });

  it("filters the directory by employment type", async () => {
    db.employee.findMany.mockResolvedValue([]);
    db.employee.count.mockResolvedValue(0);
    db.employee.groupBy.mockResolvedValue([]);
    await employeeService.getEmployeeDirectory(admin, { employmentType: "INTERN" });
    expect(db.employee.findMany.mock.calls[0][0].where).toEqual({ employmentType: "INTERN" });
  });
});

describe("EmployeeDirectoryTable", () => {
  it("shows the summary cards, status chips with counts and the type filter", () => {
    render(<EmployeeDirectoryTable result={page([LEAD])} summary={SUMMARY} params={NO_FILTERS} basePath="/admin/employees" />);
    const cards = screen.getByRole("group", { name: "Employee summary" });
    expect(within(cards).getByRole("link", { name: /Interns/ }).getAttribute("href")).toBe("/admin/employees?type=intern");
    expect(within(cards).getByRole("link", { name: /On Probation/ }).getAttribute("href")).toBe("/admin/employees?status=PROBATION");
    const chips = screen.getByRole("navigation", { name: "Filter by status" });
    expect(within(chips).getByRole("link", { name: /Active/ }).textContent).toContain("5");
    expect(within(chips).getByRole("link", { name: /All/ }).getAttribute("aria-current")).toBe("page");
    const types = screen.getByRole("navigation", { name: "Filter by employment type" });
    expect(within(types).getAllByRole("link").map((link) => link.textContent)).toEqual(["All types", "Full-time5", "Interns3"]);
  });

  it("lists each employee with role, manager, code, joining day and a link to the record", () => {
    render(<EmployeeDirectoryTable result={page([LEAD])} summary={SUMMARY} params={NO_FILTERS} basePath="/admin/employees" detailHrefBase="/admin/employees" />);
    const row = within(screen.getByRole("list", { name: "Employees" })).getAllByRole("listitem")[0];
    expect(within(row).getByRole("link", { name: "Test Engineering Lead" }).getAttribute("href")).toBe("/admin/employees/e2");
    expect(row.textContent).toContain("Engineering Manager");
    expect(row.textContent).toContain("Test Director");
    expect(row.textContent).toContain("GARA-EMP-0002");
    expect(row.textContent).toContain("Joined 22 Sept 2026");
    expect(row.textContent).toContain("Full-time");
    expect(employeeInitials("Test Engineering Lead")).toBe("TL");
  });

  it("offers no record links to viewers who may not open records (sub-admin)", () => {
    render(<EmployeeDirectoryTable result={page([LEAD])} params={NO_FILTERS} basePath="/subadmin/employees" detailHrefBase={null} />);
    const row = within(screen.getByRole("list", { name: "Employees" })).getAllByRole("listitem")[0];
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
    // Without totals the cards are left out instead of showing zeros.
    expect(screen.queryByRole("group", { name: "Employee summary" })).toBeNull();
  });

  it("keeps the status and type filters when searching and offers to clear them", () => {
    const params = { ...NO_FILTERS, status: "ACTIVE" as const, type: "INTERN" as const };
    render(<EmployeeDirectoryTable result={page([], 0)} summary={SUMMARY} params={params} basePath="/admin/employees" />);
    const form = screen.getByRole("search", { name: "Search the employee directory" });
    expect(form.querySelector('input[name="status"]')?.getAttribute("value")).toBe("ACTIVE");
    expect(form.querySelector('input[name="type"]')?.getAttribute("value")).toBe("intern");
    expect(screen.getByText("No employee matches these filters")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Clear filters" })[0].getAttribute("href")).toBe("/admin/employees");
  });
});

describe("Manage Employee controls", () => {
  const staff = [{ id: "e1", employeeCode: "GARA-EMP-0001", name: "Test Director" }];

  it("switches between tabs and saves a status with the remarks", async () => {
    actions.updateEmployeeStatusAction.mockResolvedValue({ success: true });
    render(<EmployeeLifecycleCard employeeId="e2" currentStatus={"PROBATION" as never} allStaff={staff} />);
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Status", "Manager", "Documents", "Offboarding"]);
    expect(screen.getByRole("button", { name: "Update status" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("radio", { name: "Active" }));
    fireEvent.change(screen.getByLabelText(/Remarks/), { target: { value: "Probation review passed" } });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    await vi.waitFor(() => expect(actions.updateEmployeeStatusAction).toHaveBeenCalled());
    const form = actions.updateEmployeeStatusAction.mock.calls[0][0] as FormData;
    expect(form.get("toStatus")).toBe("ACTIVE");
    expect(form.get("remarks")).toBe("Probation review passed");

    fireEvent.click(screen.getByRole("tab", { name: "Offboarding" }));
    expect(screen.getByRole("tab", { name: "Offboarding" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Last working day")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record exit" })).toBeTruthy();
  });

  it("has no Offboarding tab for an employee who has exited", () => {
    render(<EmployeeLifecycleCard employeeId="e2" currentStatus={"EXITED" as never} allStaff={staff} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Status", "Manager", "Documents"]);
    expect(screen.getByText(/This employee has exited/)).toBeTruthy();
  });
});
