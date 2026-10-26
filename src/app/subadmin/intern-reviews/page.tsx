import React from "react";
import { InternReviewsView } from "@/features/employees/components/intern-reviews-view";
import type { RawSearchParams } from "@/features/employees/components/list-search-params";

export const instant = false;

export const metadata = {
  title: "Intern Reviews — GARA Innovation",
  description: "Scheduled intern progress reviews and recent decisions.",
};

interface InternReviewsPageProps {
  /** `view` (due | overdue | upcoming | decided) and `page`. */
  searchParams: Promise<RawSearchParams>;
}

/**
 * Authorization (session, role, canEmployees; outcome recording for ADMIN / HR) is performed by
 * InternReviewsView itself; the layout is not relied upon.
 */
export default async function InternReviewsPage({ searchParams }: InternReviewsPageProps) {
  return <InternReviewsView portal="subadmin" searchParams={searchParams} />;
}
