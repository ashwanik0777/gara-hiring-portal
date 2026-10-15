import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getStorageService } from "@/infrastructure/storage";
import { validateFormResponses, FileMetadataInput } from "@/features/application-forms/services/form-validator";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import {
  ApplicationStatus,
  CandidateApplicationSummary,
  CandidateApplicationDetail,
  CandidateProfileData,
} from "../types";
import { CandidateProfileInput } from "../schemas";
import { NotFoundError, ForbiddenError, ValidationError } from "@/lib/errors";
import { OpeningStatus, Prisma } from "@prisma/client";

/**
 * Generates an immutable human-readable reference code.
 * Format: GARA-<YEAR>-APP-<6_ALPHANUMERIC>
 * Example: GARA-2026-APP-7F3A9C
 */
export function generateApplicationReference(): string {
  const year = 2026; // Stable anchor aligned with Next.js static prerender policy
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `GARA-${year}-APP-${randomSuffix}`;
}

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
      };
    }

    // Auto-create CandidateProfile linked to User
    const profile = await prisma.candidateProfile.create({
      data: {
        userId: user.id,
      },
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
  }): Promise<{ applicationId: string; referenceCode: string }> {
    const { userId, openingSlug, responses, resumeFile } = params;

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
      const created = await prisma.candidateProfile.create({
        data: { userId },
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
      throw new NotFoundError("Opening not found");
    }

    if (opening.status !== OpeningStatus.PUBLISHED) {
      throw new ValidationError(
        `This opening is currently ${opening.status.toLowerCase()} and is not accepting applications.`
      );
    }

    const activeFormVersion = opening.formVersions[0];
    if (!activeFormVersion) {
      throw new ValidationError("This opening does not have an active application form configured.");
    }

    const formSchema = activeFormVersion.schemaDefinition as unknown as FormSchemaDefinition;

    // 3. Server-side validation of untrusted responses & file
    const fileInputs: Record<string, FileMetadataInput> = {};
    if (resumeFile) {
      fileInputs["resume"] = resumeFile;
    }

    const validation = validateFormResponses(formSchema, responses, fileInputs);
    if (!validation.isValid) {
      const issues = Object.entries(validation.errors).map(([field, message]) => ({
        field,
        message,
      }));
      throw new ValidationError("Application form validation failed", issues);
    }

    if (!resumeFile) {
      throw new ValidationError("Resume document (PDF) is required", [
        { field: "resume", message: "Please attach your resume in PDF format (up to 5MB)" },
      ]);
    }

    // 4. Secure upload to isolated private storage
    const storageService = getStorageService();
    const uploadResult = await storageService.upload(
      resumeFile.buffer,
      resumeFile.name,
      resumeFile.type,
      `resumes/${opening.slug}`
    );

    // 5. Generate unique reference code
    let referenceCode = generateApplicationReference();
    // Safety check against collisions
    const existingRef = await prisma.application.findUnique({
      where: { referenceCode },
    });
    if (existingRef) {
      referenceCode = `${referenceCode}-${crypto.randomBytes(1).toString("hex").toUpperCase()}`;
    }

    // 6. DB Transaction: Application + Status History + Outbox
    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          referenceCode,
          openingId: opening.id,
          candidateId: profileId,
          formVersionId: activeFormVersion.id,
          status: ApplicationStatus.SUBMITTED,
          submittedResponses: validation.sanitizedResponses as Prisma.InputJsonValue,
          resumeStorageKey: uploadResult.storageKey,
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
          },
        },
      });

      return application;
    });

    return {
      applicationId: result.id,
      referenceCode: result.referenceCode,
    };
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
      resumeDownloadUrl: `/api/candidate/applications/${application.id}/resume`,
      timeline: application.statusHistory,
    };
  }

  /**
   * Retrieves candidate's uploaded resume for secure streaming.
   * Enforces ownership or staff role authorization.
   */
  async getApplicationResume(
    applicationId: string,
    userId: string,
    isStaff = false
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: {
          select: { userId: true },
        },
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (!isStaff && application.candidate.userId !== userId) {
      throw new ForbiddenError("You are not authorized to download this document");
    }

    const storage = getStorageService();
    const file = await storage.get(application.resumeStorageKey);
    if (!file) {
      throw new NotFoundError("Resume file could not be retrieved from private storage");
    }

    return file;
  }
}

export const applicationService = new ApplicationService();
