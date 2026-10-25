import React from "react";
import { InternReviewsView } from "@/features/employees/components/intern-reviews-view";

export const instant = false;

export const metadata = {
  title: "Intern Reviews — GARA Innovation",
  description: "Scheduled intern progress reviews and recent decisions.",
};

/**
 * Authorization (session, role, canEmployees; outcome recording for ADMIN / HR) is performed by
 * InternReviewsView itself; the layout is not relied upon.
 */
export default async function InternReviewsPage() {
  return <InternReviewsView portal="admin" />;
}
