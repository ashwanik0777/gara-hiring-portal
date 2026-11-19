import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { StatCard, StatGrid, StatGridSkeleton } from "@/components/ui/stat-card";

describe("StatCard", () => {
  it("shows the label and a locale-formatted number", () => {
    render(<StatCard label="Registrations" value={12345} icon={Users} tone="blue" hint="Last 30 days" />);
    expect(screen.getByText("Registrations")).toBeTruthy();
    expect(screen.getByText("12,345")).toBeTruthy();
    expect(screen.getByText("Last 30 days")).toBeTruthy();
  });

  it("keeps string values such as currency as given", () => {
    render(<StatCard label="Disbursed" value="₹1,20,000" />);
    expect(screen.getByText("₹1,20,000")).toBeTruthy();
  });

  it("renders an em dash with a screen-reader note when nothing is recorded", () => {
    render(<StatCard label="Median days" value={null} />);
    expect(screen.getByText("Not recorded")).toBeTruthy();
  });

  it("never shows a zero when the query failed", () => {
    render(<StatCard label="Pending" value={0} unavailable hint="should not show" />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("should not show")).toBeNull();
  });

  it("becomes a single link when given an href", () => {
    render(<StatCard label="Not applied yet" value={7} href="/admin/registrations?applied=no" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/admin/registrations?applied=no");
    expect(link.textContent).toContain("Not applied yet");
  });

  it("groups cards under an accessible name", () => {
    render(
      <StatGrid label="Leave summary" columns={3}>
        <StatCard label="Pending" value={1} />
      </StatGrid>
    );
    expect(screen.getByRole("group", { name: "Leave summary" })).toBeTruthy();
  });

  it("announces the loading state of a skeleton grid", () => {
    render(<StatGridSkeleton count={3} columns={3} label="Loading leave summary" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("Loading leave summary");
  });
});
