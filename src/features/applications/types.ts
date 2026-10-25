import type { CareerInterest } from "@/types/enums";
import { ApplicationStatus } from "@prisma/client";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import type { DocumentLinkView } from "./document-links";

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
  /** True when a resume file is stored for this application (local storage mode). */
  hasResume: boolean;
  resumeDownloadUrl: string;
  /** The resume share link the candidate submitted (link mode); null when none. */
  resumeLink: DocumentLinkView | null;
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
  careerInterest?: CareerInterest | null;
}
