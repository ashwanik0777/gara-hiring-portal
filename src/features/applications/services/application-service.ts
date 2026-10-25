import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  validateFormResponses,
  getPrimaryFileField,
  FileMetadataInput,
} from "@/features/application-forms/services/form-validator";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import {
  ApplicationStatus,
  CandidateApplicationSummary,
  CandidateApplicationDetail,
  CandidateProfileData,
} from "../types";
import { CandidateProfileInput } from "../schemas";
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  RECRUITMENT_STAFF_ROLES,
  isAssignedToApplication,
  isInterviewerScoped,
} from "@/features/recruitment/services/application-access";
import { OpeningStatus, Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { describeDocumentLink, type DocumentLinkView } from "../document-links";
import { normalizeStoredAttribution, type ResolvedAttribution } from "../source-tracking";

/** Bounded number of attempts to find an unused reference code. */
export const MAX_REFERENCE_ATTEMPTS = 5;

/**
 * Stored in `Application.resumeStorageKey` (a required column) when the published
 * form did not request a document and the candidate attached none.
 */
export const NO_RESUME_STORAGE_KEY = "";

/** Shown when a file is sent while documents are collected as share links. */
export const FILE_UPLOADS_DISABLED_MESSAGE =
  "File uploads aren't available. Please paste a share link to your resume instead.";

/** Returned by the resume download for applications whose resume is an external link. */
export const RESUME_IS_LINK_MESSAGE =
  "This resume was shared as a link, so there is no file to download. Open the link from the application page instead.";

/** 404 raised by the resume download when the application only has a share link. */
export class ResumeIsLinkError extends AppError {
  constructor() {
    super(RESUME_IS_LINK_MESSAGE, "RESUME_IS_LINK", 404);
  }
}

/**
 * Generates an immutable human-readable reference code.
 * Format: GARA-<YEAR>-APP-<6_HEX>, using the UTC year of submission.
 * Example: GARA-2026-APP-7F3A9C
 */
export function generateApplicationReference(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `GARA-${year}-APP-${randomSuffix}`;
}

/** Detects a Prisma unique-constraint violation structurally (works across client versions). */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

const PDF_MAGIC_BYTES = "%PDF-";

/** Summary shown above per-field errors when the submitted form is invalid. */
export const APPLICATION_FORM_INVALID_MESSAGE =
  "Some answers need your attention. Please check the highlighted fields and try again.";

export class ApplicationService {
  /**
   * Retrieves or initializes a CandidateProfile for a registered User.
   */
  async getOrCreateCandidateProfile(userId: string): Promise<CandidateProfileData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { candidateProfile: true },
    });

    if (!user) {
      throw new NotFoundError("User account not found");
    }

    if (user.candidateProfile) {
      return {
        id: user.candidateProfile.id,
        userId: user.id,
        fullName: user.name,
        email: user.email,
        phone: user.candidateProfile.phone,
        location: user.candidateProfile.location,
        currentOrganization: user.candidateProfile.currentOrganization,
        highestEducation: user.candidateProfile.highestEducation,
        linkedinUrl: user.candidateProfile.linkedinUrl,
        githubUrl: user.candidateProfile.githubUrl,
        portfolioUrl: user.candidateProfile.portfolioUrl,
        careerInterest: user.candidateProfile.careerInterest,
      };
    }

    // Auto-create CandidateProfile linked to User (upsert tolerates concurrent first requests)
    const profile = await prisma.candidateProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    return {
      id: profile.id,
      userId: user.id,
      fullName: user.name,
      email: user.email,
    };
  }

  /**
   * Updates candidate profile attributes.
   */
  async updateCandidateProfile(
    userId: string,
    data: CandidateProfileInput
  ): Promise<CandidateProfileData> {
    const profile = await this.getOrCreateCandidateProfile(userId);

    const updated = await prisma.candidateProfile.update({
      where: { id: profile.id },
      data: {
        phone: data.phone,
        location: data.location,
        currentOrganization: data.currentOrganization,
        highestEducation: data.highestEducation,
        linkedinUrl: data.linkedinUrl || null,
        githubUrl: data.githubUrl || null,
        portfolioUrl: data.portfolioUrl || null,
        ...(data.careerInterest ? { careerInterest: data.careerInterest } : {}),
      },
      include: { user: true },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      fullName: updated.user.name,
      email: updated.user.email,
      phone: updated.phone,
      location: updated.location,
      currentOrganization: updated.currentOrganization,
      highestEducation: updated.highestEducation,
      linkedinUrl: updated.linkedinUrl,
      githubUrl: updated.githubUrl,
      portfolioUrl: updated.portfolioUrl,
    };
  }

  /**
   * Submits an application for an active published opening.
   */
  async submitApplication(params: {
    userId: string;
    openingSlug: string;
    responses: Record<string, unknown>;
    resumeFile?: {
      name: string;
      size: number;
      type: string;
      buffer: Buffer | Uint8Array;
    };
    /** Normalized candidate source (see source-tracking.ts); a direct apply when omitted. */
    attribution?: ResolvedAttribution;
  }): Promise<{ applicationId: string; referenceCode: string }> {
    const { userId, openingSlug, responses, resumeFile } = params;
    // Re-checked here so only allow-listed codes and bounded plain text are ever stored.
    const attribution = normalizeStoredAttribution(params.attribution);

    // 1. Fetch user & ensure profile exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { candidateProfile: true },
    });
    if (!user) {
      throw new NotFoundError("Candidate account not found");
    }

    let profileId = user.candidateProfile?.id;
    if (!profileId) {
      const created = await prisma.candidateProfile.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
      profileId = created.id;
    }

    // 2. Fetch opening and verify it is PUBLISHED
    const opening = await prisma.opening.findUnique({
      where: { slug: openingSlug },
      include: {
        formVersions: {
          where: { isPublished: true },
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!opening) {
      throw new NotFoundError("We couldn't find this opening. It may have been removed.");
    }

    if (opening.status !== OpeningStatus.PUBLISHED) {
      throw new ValidationError("This opening is no longer accepting applications.");
    }

    const activeFormVersion = opening.formVersions[0];
    if (!activeFormVersion) {
      throw new ValidationError(
        "This opening isn't accepting applications right now. Please try again later."
      );
    }

    // Duplicate-application handling is undecided (OD-005): repeat submissions are not
    // blocked here; the submission rate limit in the Server Action is the technical safeguard.

    const formSchema = activeFormVersion.schemaDefinition as unknown as FormSchemaDefinition;

    // 3. Server-side validation of untrusted responses & document.
    // The single document maps to the form's primary file field; whether it is mandatory is
    // decided by the published form definition only. In "link" mode (decision 2026-10-25) the
    // candidate provides an https share link and no file is accepted or stored.
    const documentMode = env.DOCUMENT_STORAGE_MODE;
    const documentField = getPrimaryFileField(formSchema);
    const documentFieldName = documentField?.name ?? "resume";
    if (resumeFile && documentMode === "link") {
      throw new ValidationError(FILE_UPLOADS_DISABLED_MESSAGE, [
        { field: documentFieldName, message: FILE_UPLOADS_DISABLED_MESSAGE },
      ]);
    }
    if (resumeFile && !documentField) {
      throw new ValidationError("This application form does not accept documents.", [
        { field: "resume", message: "Remove the attached document and submit again." },
      ]);
    }

    const fileInputs: Record<string, FileMetadataInput> = {};
    if (resumeFile && documentField) {
      fileInputs[documentField.name] = resumeFile;
    }

    const validation = validateFormResponses(formSchema, responses, fileInputs, { documentMode });
    if (!validation.isValid) {
      const issues = Object.entries(validation.errors).map(([field, message]) => ({
        field,
        message,
      }));
      throw new ValidationError(APPLICATION_FORM_INVALID_MESSAGE, issues);
    }
    const resumeUrl = documentMode === "link" ? validation.documentLink : null;

    if (resumeFile) {
      // Validate PDF magic bytes to prevent MIME type spoofing
      const headerString = Buffer.from(resumeFile.buffer.slice(0, PDF_MAGIC_BYTES.length)).toString(
        "ascii"
      );
      if (!headerString.startsWith(PDF_MAGIC_BYTES)) {
        throw new ValidationError("The uploaded file is not a valid PDF document", [
          { field: documentFieldName, message: "Please upload a genuine PDF file" },
        ]);
      }
    }

    // 4. Secure upload to isolated private storage (local mode, only when a document was
    // attached). Link mode never touches storage.
    const storageService = resumeFile
      ? (await import("@/infrastructure/storage")).getStorageService()
      : null;
    const uploadResult =
      resumeFile && storageService
        ? await storageService.upload(
            resumeFile.buffer,
            resumeFile.name,
            resumeFile.type,
            `resumes/${opening.slug}`
          )
        : null;
    const resumeStorageKey = uploadResult?.storageKey ?? NO_RESUME_STORAGE_KEY;

    // 5 + 6. DB Transaction: Application + Status History + Outbox + Audit.
    // The unique constraint on referenceCode is the collision check; a collision retries
    // with a fresh code a bounded number of times.
    try {
      const result = await this.createApplicationWithUniqueReference((referenceCode) =>
        prisma.$transaction(async (tx) => {
          const application = await tx.application.create({
            data: {
              referenceCode,
              openingId: opening.id,
              candidateId: profileId,
              formVersionId: activeFormVersion.id,
              status: ApplicationStatus.SUBMITTED,
              submittedResponses: validation.sanitizedResponses as Prisma.InputJsonValue,
              resumeStorageKey,
              resumeUrl,
              source: attribution.source,
              sourceDetail: attribution.sourceDetail,
            },
          });

          await tx.applicationStatusHistory.create({
            data: {
              applicationId: application.id,
              fromStatus: "DRAFT",
              toStatus: ApplicationStatus.SUBMITTED,
              actorId: userId,
              candidateMessage:
                "Your application has been received and logged successfully into the recruitment pipeline.",
            },
          });

          await tx.notificationOutbox.create({
            data: {
              recipientEmail: user.email,
              templateName: "APPLICATION_CONFIRMATION",
              payload: {
                referenceCode: application.referenceCode,
                candidateName: user.name,
                openingTitle: opening.title,
                submittedAt: application.createdAt.toISOString(),
              },
              status: "PENDING",
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: userId,
              actorRole: "CANDIDATE",
              action: "SUBMIT_APPLICATION",
              resourceType: "APPLICATION",
              resourceId: application.id,
              diffPayload: {
                referenceCode: application.referenceCode,
                openingSlug: opening.slug,
                source: attribution.source,
              },
            },
          });

          return application;
        })
      );

      return {
        applicationId: result.id,
        referenceCode: result.referenceCode,
      };
    } catch (error) {
      // Never leave an orphaned private document behind when the records were not written.
      if (uploadResult && storageService) {
        await storageService.delete(uploadResult.storageKey).catch((cleanupError: unknown) => {
          logger.error("Failed to remove uploaded document after a failed submission", cleanupError, {
            openingId: opening.id,
          });
        });
      }
      throw error;
    }
  }

  /**
   * Runs `create` with freshly generated reference codes until one is accepted by the
   * unique constraint, up to MAX_REFERENCE_ATTEMPTS. Other errors propagate unchanged.
   */
  private async createApplicationWithUniqueReference<T>(
    create: (referenceCode: string) => Promise<T>
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt++) {
      try {
        return await create(generateApplicationReference());
      } catch (error) {
        // The only unique constraint written by the submission transaction is referenceCode.
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }
        logger.warn("Application reference code collision; retrying", { attempt });
      }
    }
    throw new ConflictError(
      "We could not register your application at this moment. Please try again."
    );
  }

  /**
   * Retrieves all non-archived applications submitted by the candidate.
   */
  async getCandidateApplications(userId: string): Promise<CandidateApplicationSummary[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { candidateProfile: true },
    });

    if (!user?.candidateProfile) {
      return [];
    }

    const applications = await prisma.application.findMany({
      where: {
        candidateId: user.candidateProfile.id,
        isArchived: false,
      },
      include: {
        opening: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: true,
            type: true,
            location: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return applications.map((app) => ({
      id: app.id,
      referenceCode: app.referenceCode,
      status: app.status,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      opening: {
        id: app.opening.id,
        title: app.opening.title,
        slug: app.opening.slug,
        department: app.opening.department,
        type: app.opening.type,
        location: app.opening.location,
      },
    }));
  }

  /**
   * Retrieves full application details for candidate.
   * STRICT IDOR PREVENTION:
   * Asserts application belongs to this candidate.
   * NEVER exposes internalNotes or staff identity to candidate.
   */
  async getCandidateApplicationDetail(
    applicationId: string,
    userId: string
  ): Promise<CandidateApplicationDetail> {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        opening: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: true,
            type: true,
            location: true,
          },
        },
        candidate: {
          select: {
            userId: true,
          },
        },
        formVersion: {
          select: {
            versionNumber: true,
            schemaDefinition: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            toStatus: true,
            candidateMessage: true,
            createdAt: true,
            // DO NOT select internalNotes or actorId - private to staff!
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    // STRICT IDOR CHECK
    if (application.candidate.userId !== userId) {
      throw new ForbiddenError("You are not authorized to view this application record");
    }

    return {
      id: application.id,
      referenceCode: application.referenceCode,
      status: application.status,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      opening: application.opening,
      formVersion: {
        versionNumber: application.formVersion.versionNumber,
        schemaDefinition: application.formVersion.schemaDefinition as unknown as FormSchemaDefinition,
      },
      submittedResponses: (application.submittedResponses ?? {}) as Record<string, unknown>,
      hasResume: application.resumeStorageKey !== NO_RESUME_STORAGE_KEY,
      resumeDownloadUrl: `/api/candidate/applications/${application.id}/resume`,
      resumeLink: describeDocumentLink(application.resumeUrl),
      timeline: application.statusHistory,
    };
  }

  /**
   * Retrieves candidate's uploaded resume for secure streaming.
   * Readable by the owning candidate, and by recruitment staff holding `canApplications`;
   * interviewer-scoped staff only for applications they are assigned to
   * (docs/SECURITY.md "Record-Level Access Examples").
   * Link-only resumes have no stored file and raise ResumeIsLinkError (404, RESUME_IS_LINK).
   */
  async getApplicationResume(
    applicationId: string,
    viewer: AuthenticatedUser
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const application = await this.loadResumeAccessRecord(applicationId, viewer);

    if (application.resumeStorageKey === NO_RESUME_STORAGE_KEY) {
      if (application.resumeUrl) {
        throw new ResumeIsLinkError();
      }
      throw new NotFoundError("No document was attached to this application.");
    }

    const { getStorageService } = await import("@/infrastructure/storage");
    const storage = getStorageService();
    const file = await storage.get(application.resumeStorageKey);
    if (!file) {
      throw new NotFoundError("This resume file is no longer available.");
    }

    return file;
  }

  /**
   * The external resume share link of an application (link mode), with the same access
   * rules as the file download. Null when the application has no valid link.
   */
  async getApplicationResumeLink(
    applicationId: string,
    viewer: AuthenticatedUser
  ): Promise<DocumentLinkView | null> {
    const application = await this.loadResumeAccessRecord(applicationId, viewer);
    return describeDocumentLink(application.resumeUrl);
  }

  /**
   * Loads the resume columns of an application after checking the viewer may read them:
   * the owning candidate, or authorized recruitment staff.
   */
  private async loadResumeAccessRecord(
    applicationId: string,
    viewer: AuthenticatedUser
  ): Promise<{ resumeStorageKey: string; resumeUrl: string | null }> {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        resumeStorageKey: true,
        resumeUrl: true,
        assignedRecruiterId: true,
        candidate: {
          select: { userId: true },
        },
        // Only the viewer's own rounds are needed to decide interviewer assignment.
        interviewSchedules: {
          where: { interviewerId: viewer.id },
          select: { interviewerId: true },
          take: 1,
        },
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (application.candidate.userId !== viewer.id) {
      await this.assertStaffMayReadApplication(viewer, {
        assignedRecruiterId: application.assignedRecruiterId,
        interviewerIds: application.interviewSchedules.map((s) => s.interviewerId),
      });
    }

    return {
      resumeStorageKey: application.resumeStorageKey,
      resumeUrl: application.resumeUrl ?? null,
    };
  }

  /**
   * Staff read access to another candidate's application: a recruitment staff role plus the
   * `canApplications` permission; interviewer-scoped users must also be assigned to it.
   */
  private async assertStaffMayReadApplication(
    viewer: AuthenticatedUser,
    assignment: { assignedRecruiterId: string | null; interviewerIds: ReadonlyArray<string | null> }
  ): Promise<void> {
    const hasStaffRole = viewer.roles.some((role) => RECRUITMENT_STAFF_ROLES.includes(role));
    if (!hasStaffRole || !(await hasPermission(viewer, "canApplications"))) {
      throw new ForbiddenError("You are not authorized to download this document");
    }
    if (isInterviewerScoped(viewer) && !isAssignedToApplication(viewer.id, assignment)) {
      throw new ForbiddenError("You are not authorized to download this document");
    }
  }
}

export const applicationService = new ApplicationService();
