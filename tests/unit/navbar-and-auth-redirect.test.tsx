import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import Link from "next/link";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { NavbarAuthActions } from "@/components/navigation/navbar-auth-actions";
import { Navbar } from "@/components/navigation/navbar";
import { FloatingActions } from "@/components/navigation/floating-actions";
import {
  LinkPendingReporter,
  NavigationProgressBar,
} from "@/components/navigation/navigation-progress";
import { Role } from "@prisma/client";

// useLinkStatus only reports a real pending state inside the App Router; the tests drive it.
const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: linkStatus.pending }) };
});

// Mock router
const mockReplace = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
    push: vi.fn(),
  }),
  usePathname: () => "/",
}));

// Mock better-auth client; tests set the session the hook reports.
const mockSignOut = vi.fn().mockResolvedValue({ success: true });
const mockHardNavigate = vi.fn();
vi.mock("@/lib/navigation/hard-navigate", () => ({ hardNavigate: (path: string) => mockHardNavigate(path) }));
const sessionMock = vi.hoisted(() => ({
  current: { data: null, isPending: false } as {
    data: null | { user: { id: string; name: string; email: string } };
    isPending: boolean;
  },
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => sessionMock.current),
    signOut: () => mockSignOut(),
  },
}));

// The floating assistant is replaced by a marker so the test sees when it is rendered.
vi.mock("@/features/chatbot/components/portal-chatbot-widget", async () => {
  const { createElement } = await import("react");
  return { PortalChatbotWidget: () => createElement("p", null, "Assistant ready") };
});

describe("NavbarAuthActions UI and State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("renders Sign In and Create Account buttons when user is not authenticated", () => {
    render(<NavbarAuthActions initialUser={null} />);

    expect(screen.getByText("Sign In")).toBeDefined();
    expect(screen.getByText("Create Account")).toBeDefined();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("renders user avatar and dropdown menu with Dashboard, Profile and Logout when authenticated", async () => {
    const mockUser = {
      id: "u123",
      name: "Ashwani Admin",
      email: "ashwani@gara.io",
      roles: [Role.ADMIN],
    };

    render(<NavbarAuthActions initialUser={mockUser} />);

    // Should NOT show Sign In or Create Account
    expect(screen.queryByText("Sign In")).toBeNull();
    expect(screen.queryByText("Create Account")).toBeNull();

    // Initial avatar initials and name
    expect(screen.getByText("AA")).toBeDefined();
    expect(screen.getByText("Ashwani Admin")).toBeDefined();
    expect(screen.getByText("Admin")).toBeDefined();

    // Open dropdown
    const trigger = screen.getByRole("button", { expanded: false });
    await act(async () => {
      fireEvent.click(trigger);
    });

    // Dropdown items must be visible
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("My Profile")).toBeDefined();
    expect(screen.getByText("Careers & Openings")).toBeDefined();
    expect(screen.getByText("Help & FAQ")).toBeDefined();
    expect(screen.getByText("Sign Out")).toBeDefined();

    // Clicking Sign Out calls authClient.signOut, then a full page load of "/" (no page from the
    // signed-in visit stays in memory).
    const signOutBtn = screen.getByText("Sign Out");
    await act(async () => {
      fireEvent.click(signOutBtn);
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockHardNavigate).toHaveBeenCalledWith("/");
    expect(mockReplace).not.toHaveBeenCalledWith("/");
  });

  it("properly resolves dashboard target link for Candidate users", async () => {
    const mockCandidate = {
      id: "cand123",
      name: "Rohan Candidate",
      email: "rohan@example.com",
      roles: [Role.CANDIDATE],
    };

    render(<NavbarAuthActions initialUser={mockCandidate} />);

    // Open dropdown
    const trigger = screen.getByRole("button", { expanded: false });
    await act(async () => {
      fireEvent.click(trigger);
    });

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.getAttribute("href")).toBe("/candidate/dashboard");

    const profileLink = screen.getByText("My Profile").closest("a");
    expect(profileLink?.getAttribute("href")).toBe("/candidate/profile");
  });
});

describe("Navbar links and the navigation progress bar", () => {
  afterEach(() => {
    cleanup();
    linkStatus.pending = false;
    vi.useRealTimers();
  });

  it("renders the public links with prefetchable hrefs and no progress bar while idle", () => {
    render(<Navbar />);

    const nav = screen.getByRole("navigation");
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/careers", "/training", "/campus-ambassador", "/verify", "/help"]);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows an accessible top progress bar only while a link navigation is pending", async () => {
    vi.useFakeTimers();
    function Harness() {
      return (
        <>
          <NavigationProgressBar />
          <Link href="/careers">
            Careers
            <LinkPendingReporter />
          </Link>
        </>
      );
    }
    const view = render(<Harness />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    // The link becomes pending: the bar appears after the short anti-flash delay.
    linkStatus.pending = true;
    view.rerender(<Harness />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("Loading page");
    expect(bar.getAttribute("aria-busy")).toBe("true");

    // The navigation completes: the bar fills, then leaves the accessibility tree.
    linkStatus.pending = false;
    view.rerender(<Harness />);
    expect(screen.getByRole("progressbar").getAttribute("aria-busy")).toBe("false");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("ignores transitions that finish before the delay", async () => {
    vi.useFakeTimers();
    function Harness() {
      return (
        <>
          <NavigationProgressBar />
          <Link href="/help">
            Help
            <LinkPendingReporter />
          </Link>
        </>
      );
    }
    const view = render(<Harness />);
    linkStatus.pending = true;
    view.rerender(<Harness />);
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    linkStatus.pending = false;
    view.rerender(<Harness />);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("NavbarAuthActions resolves roles without redundant requests", () => {
  const sessionFor = (id: string, name: string) => ({
    data: { user: { id, name, email: `${id}@gara.test` } },
    isPending: false,
  });
  const meResponse = (user: { id: string; name: string; roles: Role[] }) =>
    new Response(JSON.stringify({ user: { ...user, email: `${user.id}@gara.test` } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionMock.current = { data: null, isPending: false };
  });

  it("never calls /api/auth/me when the server already rendered the signed-in user", async () => {
    sessionMock.current = sessionFor("u123", "Ashwani Admin");
    render(
      <NavbarAuthActions
        initialUser={{ id: "u123", name: "Ashwani Admin", email: "ashwani@gara.io", roles: [Role.ADMIN] }}
      />
    );
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Admin")).toBeDefined();
  });

  it("resolves roles once per signed-in user on static pages, not on every session refetch", async () => {
    fetchMock.mockResolvedValue(meResponse({ id: "u-hr", name: "Priya Staff", roles: [Role.HR] }));
    sessionMock.current = sessionFor("u-hr", "Priya Staff");
    const view = render(<NavbarAuthActions initialUser={null} />);

    expect(await screen.findByText("Priya Staff")).toBeDefined();
    expect(screen.getByText("HR")).toBeDefined();

    // Better Auth hands out a new session object on refetch (e.g. window focus).
    sessionMock.current = sessionFor("u-hr", "Priya Staff");
    view.rerender(<NavbarAuthActions initialUser={null} />);
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me");
  });

  it("falls back to the session's basic data as a candidate when /api/auth/me is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    sessionMock.current = sessionFor("u-c", "Rohan Candidate");
    render(<NavbarAuthActions initialUser={null} />);

    expect(await screen.findByText("Rohan Candidate")).toBeDefined();
    expect(screen.getByText("Candidate")).toBeDefined();
  });
});

describe("FloatingActions opens the assistant on demand", () => {
  afterEach(cleanup);

  it("renders the assistant only after the visitor opens it", async () => {
    render(<FloatingActions />);
    expect(screen.queryByText("Assistant ready")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ask GARA AI Assistant" }));
    expect(await screen.findByText("Assistant ready")).toBeDefined();
  });
});
