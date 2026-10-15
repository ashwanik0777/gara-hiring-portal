import { describe, it, expect } from "vitest";
import {
  createOpeningSchema,
  VALID_STATUS_TRANSITIONS,
} from "@/features/openings/schemas";
import {
  formSchemaDefinitionSchema,
  formFieldDefinitionSchema,
} from "@/features/application-forms/schemas";
import { getDefaultApplicationFormSchema } from "@/features/application-forms/default-form";
import { OpeningStatus, OpeningType, WorkplaceType } from "@prisma/client";

describe("features/openings/schemas", () => {
  it("validates valid opening input successfully", () => {
    const validData = {
      title: "Frontend Engineering Intern",
      slug: "frontend-engineering-intern",
      department: "Web Platform",
      type: OpeningType.INTERNSHIP,
      location: "Bengaluru, India",
      workplaceType: WorkplaceType.REMOTE,
      description: "Join GARA Innovation to build high-performance accessible frontend systems.",
      requirements: "Experience with React, TypeScript, and modern CSS frameworks.",
    };

    const parsed = createOpeningSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid slugs containing spaces or uppercase characters", () => {
    const invalidData = {
      title: "Backend Engineer",
      slug: "Backend Engineer 2026!",
      department: "Core Systems",
      type: OpeningType.FULL_TIME,
      location: "Bengaluru",
      workplaceType: WorkplaceType.HYBRID,
      description: "Build robust scalable distributed services for GARA Innovation.",
      requirements: "Strong background in PostgreSQL, Node.js, and API design.",
    };

    const parsed = createOpeningSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const slugError = parsed.error.format().slug?._errors;
      expect(slugError).toBeDefined();
    }
  });

  it("enforces strict lifecycle status transitions", () => {
    // Valid transitions
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.DRAFT]).toContain(OpeningStatus.PUBLISHED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.PUBLISHED]).toContain(OpeningStatus.PAUSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.PUBLISHED]).toContain(OpeningStatus.CLOSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.PAUSED]).toContain(OpeningStatus.PUBLISHED);

    // Invalid transitions
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.DRAFT]).not.toContain(OpeningStatus.PAUSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.DRAFT]).not.toContain(OpeningStatus.CLOSED);
    expect(VALID_STATUS_TRANSITIONS[OpeningStatus.CLOSED]).toEqual([]);
  });
});

describe("features/application-forms/schemas", () => {
  it("validates default application form schema structure", () => {
    const defaultSchema = getDefaultApplicationFormSchema("INTERNSHIP");
    const parsed = formSchemaDefinitionSchema.safeParse(defaultSchema);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const resumeSection = defaultSchema.sections.find((s) => s.id === "documents-upload");
      expect(resumeSection).toBeDefined();
      const resumeField = resumeSection?.fields.find((f) => f.name === "resume");
      expect(resumeField?.type).toBe("file");
      expect(resumeField?.required).toBe(true);
      expect(resumeField?.validation?.maxFileSizeMb).toBe(5);
    }
  });

  it("rejects field definitions with invalid naming patterns", () => {
    const invalidField = {
      id: "field-1",
      name: "invalid name with spaces & symbols!",
      label: "My Question",
      type: "text",
      required: false,
      order: 1,
    };

    const parsed = formFieldDefinitionSchema.safeParse(invalidField);
    expect(parsed.success).toBe(false);
  });
});
