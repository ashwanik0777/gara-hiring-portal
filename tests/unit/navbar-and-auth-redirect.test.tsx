import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NavbarAuthActions } from "@/components/navigation/navbar-auth-actions";
import { Role } from "@prisma/client";

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
      email: "rohan@gmail.com",
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
