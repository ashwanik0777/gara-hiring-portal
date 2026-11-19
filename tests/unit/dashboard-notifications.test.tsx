import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SystemNotification } from "@/features/notifications/types";

// ---------------------------------------------------------------------------
// Header notification bell (round 8): read / dismissed state stays in the browser, no
// Server Action writes cookies (which re-rendered the whole page), and the list is
// fetched on mount and when the bell opens, never when it closes.
// ---------------------------------------------------------------------------

const { mockFetchNotifications, mockGetCurrentUser, mockBuild, mockCookies } = vi.hoisted(() => ({
  mockFetchNotifications: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockBuild: vi.fn(),
  mockCookies: vi.fn(),
}));

vi.mock("@/features/notifications/actions", () => ({
  getDashboardNotificationsAction: () => mockFetchNotifications(),
}));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
vi.mock("@/features/notifications/services/notification-service", () => ({
  buildNotificationsForUser: (...args: unknown[]) => mockBuild(...args),
}));
vi.mock("next/headers", () => ({ cookies: () => mockCookies() }));
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { DashboardNotifications } from "@/components/dashboard/dashboard-notifications";

function notification(id: string, createdAt: string): SystemNotification {
  return {
    id,
    title: `Title ${id}`,
    message: `Message ${id}`,
    type: "application",
    link: `/admin/applications/${id}`,
    createdAt,
  };
}

const ITEMS = [
  notification("app-1", "2026-10-31T10:00:00.000Z"),
  notification("app-2", "2026-10-30T10:00:00.000Z"),
];

async function renderBell() {
  render(<DashboardNotifications userId="user-1" />);
  await act(async () => {});
}

const bell = () => screen.getByRole("button", { name: "View Notifications" });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockFetchNotifications.mockResolvedValue(ITEMS);
});

afterEach(() => {
  cleanup();
});

describe("DashboardNotifications", () => {
  it("fetches once on mount, again when the bell opens, and not when it closes", async () => {
    await renderBell();
    expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
    expect(bell().textContent).toContain("2");

    await act(async () => fireEvent.click(bell()));
    expect(mockFetchNotifications).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Title app-1")).toBeTruthy();

    await act(async () => fireEvent.click(bell()));
    expect(mockFetchNotifications).toHaveBeenCalledTimes(2);

    await act(async () => fireEvent.click(bell()));
    expect(mockFetchNotifications).toHaveBeenCalledTimes(3);
    await act(async () => fireEvent.keyDown(document, { key: "Escape" }));
    expect(screen.queryByText("Title app-1")).toBeNull();
    expect(mockFetchNotifications).toHaveBeenCalledTimes(3);
  });

  it("keeps read and dismissed state per user in localStorage only", async () => {
    await renderBell();
    await act(async () => fireEvent.click(bell()));

    await act(async () => fireEvent.click(screen.getAllByTitle("Dismiss notification")[1]));
    expect(screen.queryByText("Title app-2")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("gara_notifications_dismissed_user-1") ?? "[]")).toEqual(["app-2"]);

    await act(async () => fireEvent.click(screen.getByText("Mark all read")));
    expect(JSON.parse(window.localStorage.getItem("gara_notifications_read_user-1") ?? "[]")).toEqual(["app-1"]);
    expect(screen.getByText("Up to date")).toBeTruthy();
    // Only the list fetch reached the server: mount + open.
    expect(mockFetchNotifications).toHaveBeenCalledTimes(2);
  });

  it("restores read and dismissed state from this browser on the next visit", async () => {
    window.localStorage.setItem("gara_notifications_read_user-1", JSON.stringify(["app-1"]));
    window.localStorage.setItem("gara_notifications_dismissed_user-1", JSON.stringify(["app-2"]));

    await renderBell();
    expect(bell().textContent).not.toMatch(/\d/);

    await act(async () => fireEvent.click(bell()));
    expect(screen.getByText("Title app-1")).toBeTruthy();
    expect(screen.queryByText("Title app-2")).toBeNull();
  });

  it("marks an item read and navigates to it on click", async () => {
    await renderBell();
    await act(async () => fireEvent.click(bell()));
    await act(async () => fireEvent.click(screen.getByText("Title app-2")));

    expect(mockPush).toHaveBeenCalledWith("/admin/applications/app-2");
    expect(JSON.parse(window.localStorage.getItem("gara_notifications_read_user-1") ?? "[]")).toEqual(["app-2"]);
    expect(bell().textContent).toContain("1");
  });
});

describe("notifications Server Actions", () => {
  it("only fetch the list, newest first, and never touch cookies", async () => {
    const actions = await vi.importActual<typeof import("@/features/notifications/actions")>(
      "@/features/notifications/actions"
    );
    expect(Object.keys(actions)).toEqual(["getDashboardNotificationsAction"]);

    mockGetCurrentUser.mockResolvedValue({ id: "user-1", roles: ["ADMIN"], mustChangePassword: false });
    mockBuild.mockResolvedValue([ITEMS[1], ITEMS[0]]);

    await expect(actions.getDashboardNotificationsAction()).resolves.toEqual([ITEMS[0], ITEMS[1]]);
    expect(mockCookies).not.toHaveBeenCalled();
  });

  it("return nothing for signed-out users and temporary-password sessions", async () => {
    const actions = await vi.importActual<typeof import("@/features/notifications/actions")>(
      "@/features/notifications/actions"
    );
    mockGetCurrentUser.mockResolvedValueOnce(null);
    await expect(actions.getDashboardNotificationsAction()).resolves.toEqual([]);
    mockGetCurrentUser.mockResolvedValueOnce({ id: "user-1", roles: ["ADMIN"], mustChangePassword: true });
    await expect(actions.getDashboardNotificationsAction()).resolves.toEqual([]);
    expect(mockBuild).not.toHaveBeenCalled();
  });
});
