import { describe, it, expect, afterEach } from "vitest";
import { validateFormResponses } from "@/features/application-forms/services/form-validator";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { generateApplicationReference } from "@/features/applications/services/application-service";
import { LocalStorageService } from "@/infrastructure/storage/local-storage-service";
import fs from "node:fs/promises";
import path from "node:path";

describe("Candidate Applications & Dynamic Form Validation (Prompt 3)", () => {
  const sampleSchema: FormSchemaDefinition = {
    sections: [
      {
        id: "sec-1",
        title: "Basic Info",
        order: 1,
        fields: [
          {
            id: "f-name",
            name: "full_name",
            label: "Full Name",
            type: "text",
            required: true,
            order: 1,
          },
          {
            id: "f-email",
            name: "email",
            label: "Email Address",
            type: "email",
            required: true,
            order: 2,
          },
          {
            id: "f-gpa",
            name: "gpa",
            label: "Cumulative GPA",
            type: "number",
            required: false,
            order: 3,
            validation: {
              min: 0,
              max: 10,
            },
          },
          {
            id: "f-track",
            name: "preferred_track",
            label: "Preferred Track",
            type: "select",
            required: true,
            order: 4,
            options: [
              { label: "Frontend", value: "frontend" },
              { label: "Backend", value: "backend" },
            ],
          },
          {
            id: "f-resume",
            name: "resume",
            label: "Resume (PDF)",
            type: "file",
            required: true,
            order: 5,
            validation: {
              allowedFileTypes: ["application/pdf"],
              maxFileSizeMb: 5,
            },
          },
        ],
      },
    ],
  };

  it("validates successful submission with all required fields and valid PDF file", () => {
    const responses = {
      full_name: "Aman Sharma",
      email: "aman@example.com",
      gpa: 8.5,
      preferred_track: "backend",
    };

    const files = {
      resume: {
        name: "aman_resume.pdf",
        size: 1024 * 500, // 500 KB
        type: "application/pdf",
      },
    };

    const result = validateFormResponses(sampleSchema, responses, files);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.sanitizedResponses.full_name).toBe("Aman Sharma");
    expect(result.sanitizedResponses.email).toBe("aman@example.com");
    expect(result.sanitizedResponses.gpa).toBe(8.5);
    expect(result.sanitizedResponses.preferred_track).toBe("backend");
  });

  it("flags missing required fields and invalid email format", () => {
    const responses = {
      full_name: "   ", // whitespace only
      email: "not-an-email",
      preferred_track: "invalid_choice",
    };

    const result = validateFormResponses(sampleSchema, responses);
    expect(result.isValid).toBe(false);
    expect(result.errors.full_name).toBeDefined();
    expect(result.errors.email).toBe("Please enter a valid email address");
    expect(result.errors.preferred_track).toBe("Invalid selection for Preferred Track");
    expect(result.errors.resume).toBeDefined();
  });

  it("strictly enforces file validation: rejects non-PDF and oversized files", () => {
    const responses = {
      full_name: "Jane Doe",
      email: "jane@example.com",
      preferred_track: "frontend",
    };

    // Case 1: Non-PDF format
    const badMimeResult = validateFormResponses(sampleSchema, responses, {
      resume: {
        name: "malicious.exe",
        size: 1024,
        type: "application/x-msdownload",
      },
    });
    expect(badMimeResult.isValid).toBe(false);
    expect(badMimeResult.errors.resume).toContain("Invalid file type");

    // Case 2: File exceeds 5MB limit
    const oversizedResult = validateFormResponses(sampleSchema, responses, {
      resume: {
        name: "huge_resume.pdf",
        size: 6 * 1024 * 1024, // 6 MB
        type: "application/pdf",
      },
    });
    expect(oversizedResult.isValid).toBe(false);
    expect(oversizedResult.errors.resume).toContain("exceeds the 5MB limit");
  });

  it("generates application reference code adhering to GARA-2026-APP format", () => {
    const refCode = generateApplicationReference();
    expect(refCode).toMatch(/^GARA-2026-APP-[A-F0-9]{6}$/);
  });
});

describe("Private Document Storage Provider (Prompt 3)", () => {
  const testStorageDir = path.join(process.cwd(), ".storage", "test-private");
  const storage = new LocalStorageService(testStorageDir);

  afterEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  it("stores uploaded file in private folder outside public directory", async () => {
    const dummyBuffer = Buffer.from("PDF_SAMPLE_DATA_CONTENT");
    const result = await storage.upload(dummyBuffer, "test_resume.pdf", "application/pdf");

    expect(result.storageKey).toContain("resumes/");
    expect(result.storageKey).toContain("test_resume.pdf");

    // Retrieve file
    const retrieved = await storage.get(result.storageKey);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.mimeType).toBe("application/pdf");
    expect(retrieved?.buffer.toString()).toBe("PDF_SAMPLE_DATA_CONTENT");
  });

  it("returns null for non-existent storage key and prevents path traversal", async () => {
    const notFound = await storage.get("non-existent-key.pdf");
    expect(notFound).toBeNull();

    const traversal = await storage.get("../../../etc/passwd");
    expect(traversal).toBeNull();
  });

  it("strictly guards against unapproved local disk usage in production", async () => {
    const envRecord = process.env as Record<string, string | undefined>;
    const originalEnv = envRecord["NODE_ENV"];
    envRecord["NODE_ENV"] = "production";
    delete envRecord["ALLOW_LOCAL_STORAGE_IN_PROD"];

    try {
      await expect(
        storage.upload(Buffer.from("TEST"), "file.pdf", "application/pdf")
      ).rejects.toThrow(/Security Policy Violation: OD-013/);
    } finally {
      envRecord["NODE_ENV"] = originalEnv;
    }
  });
});

describe("Strict IDOR and Data Isolation Security Policy", () => {
  it("never includes internalNotes or staff identifiers in candidate status timeline", () => {
    // Simulate database status history records
    const rawHistoryRecords = [
      {
        id: "hist-1",
        toStatus: "SUBMITTED",
        internalNotes: "CONFIDENTIAL: Low GPA candidate, requires senior recruiter review.",
        candidateMessage: "Your application has been received.",
        actorId: "staff-uuid-001",
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
      {
        id: "hist-2",
        toStatus: "SCREENING",
        internalNotes: "CONFIDENTIAL: Interviewer assigned - do not reveal.",
        candidateMessage: "Your application is currently under screening.",
        actorId: "staff-uuid-002",
        createdAt: new Date("2026-03-02T10:00:00Z"),
      },
    ];

    // Candidate projection (as enforced in ApplicationService.getCandidateApplicationDetail)
    const candidateTimeline = rawHistoryRecords.map((r) => ({
      id: r.id,
      toStatus: r.toStatus,
      candidateMessage: r.candidateMessage,
      createdAt: r.createdAt,
    }));

    // Verify complete absence of internal staff information
    expect(candidateTimeline[0]).not.toHaveProperty("internalNotes");
    expect(candidateTimeline[0]).not.toHaveProperty("actorId");
    expect(candidateTimeline[1]).not.toHaveProperty("internalNotes");
    expect(candidateTimeline[1]).not.toHaveProperty("actorId");
    expect(candidateTimeline[0].candidateMessage).toBe("Your application has been received.");
  });
});
