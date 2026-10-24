import React, { Suspense } from "react";
import { Metadata } from "next";
import { VerificationPortal } from "@/components/verification/verification-portal";
import { PublicDetailSkeleton } from "@/components/feedback/page-skeletons";

export const metadata: Metadata = {
  title: "Verify Certificate | GARA Innovation",
  description:
    "Verify official internship certificates and completion credentials issued by GARA Innovation via our central public registry.",
};

export default function VerifyIndexPage() {
  return (
    <Suspense
      fallback={<PublicDetailSkeleton withForm label="Loading credential verification" />}
    >
      <VerificationPortal />
    </Suspense>
  );
}
