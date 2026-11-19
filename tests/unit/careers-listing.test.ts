import { describe, it, expect } from "vitest";
import {
  dateKeyFromDeadline,
  deadlineFromDateKey,
  formatDeadline,
  isApplicationWindowClosed,
  isValidDateKey,
  matchesCareersFilters,
  normalizeSkills,
  parseCareersFilters,
} from "@/features/openings/listing";
import { createOpeningSchema, trackSchema } from "@/features/openings/schemas";
import { buildJobPostingJsonLd } from "@/app/careers/_lib/seo";

const VALID_OPENING = {
  title: "Frontend Engineering Intern",
  slug: "frontend-engineering-intern",
  department: "Web Platform",
  type: "INTERNSHIP" as const,
  location: "Bengaluru, India",
  workplaceType: "REMOTE" as const,
  description: "Join GARA Innovation to build accessible frontend systems for students.",
  requirements: "Experience with React, TypeScript and CSS.",
};

describe("application deadline", () => {
  it("keeps applications open for the whole last day in India time", () => {
    const deadline = deadlineFromDateKey("2026-11-30");
    expect(deadline.toISOString()).toBe("2026-11-30T18:29:59.999Z");
    expect(dateKeyFromDeadline(deadline)).toBe("2026-11-30");
    expect(formatDeadline(deadline)).toBe("30 Nov 2026");
  });

  it("handles month and year ends", () => {
    expect(deadlineFromDateKey("2026-12-31").toISOString()).toBe("2026-12-31T18:29:59.999Z");
    expect(deadlineFromDateKey("2028-02-29").toISOString()).toBe("2028-02-29T18:29:59.999Z");
  });

  it("closes only after the deadline; openings without one stay open", () => {
    const deadline = deadlineFromDateKey("2026-11-30");
    expect(isApplicationWindowClosed(deadline, new Date("2026-11-30T18:29:59.000Z"))).toBe(false);
    expect(isApplicationWindowClosed(deadline, new Date("2026-11-30T18:30:00.000Z"))).toBe(true);
    expect(isApplicationWindowClosed(null, new Date("2030-01-01"))).toBe(false);
  });

  it("accepts only real calendar dates", () => {
    expect(isValidDateKey("2026-11-30")).toBe(true);
    expect(isValidDateKey("2026-02-31")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("30-11-2026")).toBe(false);
  });
});

describe("careers filters", () => {
  it("reads known filter values and ignores anything else", () => {
    expect(parseCareersFilters({ type: "internship", mode: "on-site" })).toEqual({ type: "internship", mode: "on-site" });
    expect(parseCareersFilters({ type: "<script>", mode: ["hybrid", "remote"] })).toEqual({ mode: "hybrid" });
    expect(parseCareersFilters({})).toEqual({});
  });

  it("matches openings by type and work mode", () => {
    const opening = { type: "INTERNSHIP" as const, workplaceType: "HYBRID" as const };
    expect(matchesCareersFilters(opening, {})).toBe(true);
    expect(matchesCareersFilters(opening, { type: "internship", mode: "hybrid" })).toBe(true);
    expect(matchesCareersFilters(opening, { type: "full-time" })).toBe(false);
    expect(matchesCareersFilters(opening, { mode: "remote" })).toBe(false);
  });
});

describe("skills", () => {
  it("splits, trims and removes duplicates, keeping the first spelling", () => {
    expect(normalizeSkills(" React,  TypeScript , react,, SQL  ")).toEqual(["React", "TypeScript", "SQL"]);
    expect(normalizeSkills(["Node.js", "node.js", "  "])).toEqual(["Node.js"]);
    expect(normalizeSkills(undefined)).toEqual([]);
  });
});

describe("opening schema: listing fields", () => {
  it("accepts an opening with all listing details", () => {
    const parsed = createOpeningSchema.safeParse({
      ...VALID_OPENING,
      trackId: "44444444-4444-4444-8444-444444444444",
      summary: "Build the careers portal.",
      skills: ["React", "SQL"],
      eligibility: "3rd and 4th year students",
      durationText: "3 months",
      stipendPolicyText: "As per the offer letter",
      openingsCount: 5,
      applyDeadline: "2026-11-30",
    });
    expect(parsed.success).toBe(true);
  });

  it("reserves the /careers/tracks slug", () => {
    expect(createOpeningSchema.safeParse({ ...VALID_OPENING, slug: "tracks" }).success).toBe(false);
  });

  it("rejects an impossible deadline, a zero position count and too many skills", () => {
    expect(createOpeningSchema.safeParse({ ...VALID_OPENING, applyDeadline: "2026-02-31" }).success).toBe(false);
    expect(createOpeningSchema.safeParse({ ...VALID_OPENING, openingsCount: 0 }).success).toBe(false);
    const skills = Array.from({ length: 21 }, (_, i) => `Skill ${i}`);
    expect(createOpeningSchema.safeParse({ ...VALID_OPENING, skills }).success).toBe(false);
  });

  it("allows empty values so staff can clear a field", () => {
    expect(createOpeningSchema.safeParse({ ...VALID_OPENING, trackId: "", applyDeadline: "", openingsCount: null }).success).toBe(true);
  });
});

describe("track schema", () => {
  it("accepts URL-safe slugs only", () => {
    const base = { name: "Full Stack & Web", sortOrder: 20, isActive: true };
    expect(trackSchema.safeParse({ ...base, slug: "full-stack" }).success).toBe(true);
    expect(trackSchema.safeParse({ ...base, slug: "Full Stack" }).success).toBe(false);
    expect(trackSchema.safeParse({ ...base, slug: "full--stack" }).success).toBe(false);
  });
});

describe("JobPosting structured data", () => {
  const opening = {
    ...VALID_OPENING,
    responsibilities: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-02T00:00:00Z"),
  };

  it("adds the deadline, skills, eligibility and number of positions when they are set", () => {
    const jsonLd = buildJobPostingJsonLd({
      ...opening,
      closesAt: deadlineFromDateKey("2026-11-30"),
      skills: ["React", "SQL"],
      eligibility: "Final-year students",
      openingsCount: 3,
    });
    expect(jsonLd).toMatchObject({
      validThrough: "2026-11-30T18:29:59.999Z",
      skills: "React, SQL",
      qualifications: "Final-year students",
      totalJobOpenings: 3,
    });
  });

  it("leaves those properties out when they are not set (nothing is invented)", () => {
    const jsonLd = buildJobPostingJsonLd({ ...opening, closesAt: null, skills: [], eligibility: null, openingsCount: null });
    for (const key of ["validThrough", "skills", "qualifications", "totalJobOpenings"]) {
      expect(key in jsonLd).toBe(false);
    }
  });
});
