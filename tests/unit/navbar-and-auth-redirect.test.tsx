import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import Link from "next/link";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { NavbarAuthActions } from "@/components/navigation/navbar-auth-actions";
import { Navbar } from "@/components/navigation/navbar";
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

// Mock better-auth client
const mockSignOut = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    signOut: () => mockSignOut(),
  },
}));

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

    // Clicking Sign Out calls authClient.signOut and redirects to "/"
    const signOutBtn = screen.getByText("Sign Out");
    await act(async () => {
      fireEvent.click(signOutBtn);
    });
    expect(mockSignOut).toHaveBeenCalled();
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
    expect(hrefs).toEqual(["/careers", "/verify", "/help"]);
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
