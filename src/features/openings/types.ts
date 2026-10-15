import { OpeningType, WorkplaceType, OpeningStatus } from "@prisma/client";

export type { OpeningType, WorkplaceType, OpeningStatus };

export interface OpeningSummary {
  id: string;
  title: string;
  slug: string;
  department: string;
  type: OpeningType;
  location: string;
  workplaceType: WorkplaceType;
  status: OpeningStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpeningDetail extends OpeningSummary {
  description: string;
  requirements: string;
  responsibilities: string | null;
  activeFormVersionId: string | null;
  createdById: string;
  formVersions?: {
    id: string;
    versionNumber: number;
    isPublished: boolean;
    createdAt: Date;
  }[];
}

export interface OpeningFilterParams {
  department?: string;
  type?: OpeningType;
  workplaceType?: WorkplaceType;
  search?: string;
}
