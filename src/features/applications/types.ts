import { ApplicationStatus } from "@prisma/client";
import { FormSchemaDefinition } from "@/features/application-forms/types";

export { ApplicationStatus };

export interface CandidateApplicationSummary {
  id: string;
  referenceCode: string;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
  opening: {
    id: string;
    title: string;
    slug: string;
    department: string;
    type: string;
    location: string;
  };
}

export interface CandidateStatusTimelineEntry {
  id: string;
  toStatus: string;
  candidateMessage: string | null;
  createdAt: Date;
}

export interface CandidateApplicationDetail extends CandidateApplicationSummary {
  formVersion: {
    versionNumber: number;
    schemaDefinition: FormSchemaDefinition;
  };
  submittedResponses: Record<string, unknown>;
  resumeDownloadUrl: string;
  timeline: CandidateStatusTimelineEntry[];
}

export interface CandidateProfileData {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  currentOrganization?: string | null;
  highestEducation?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
}
