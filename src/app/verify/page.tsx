import React, { Suspense } from "react";
import { Metadata } from "next";
import { VerificationPortal } from "@/components/verification/verification-portal";

export const metadata: Metadata = {
  title: "Verify Certificate | GARA Innovation",
  description:
    "Verify official internship certificates and completion credentials issued by GARA Innovation via our central public registry.",
};

export default function VerifyIndexPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-7xl mx-auto px-4 min-h-[40vh] flex flex-col items-center justify-center p-8">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
          <p className="text-xs text-muted-foreground font-mono">
            Connecting to GARA Credential Registry...
          </p>
        </div>
      }
    >
      <VerificationPortal />
    </Suspense>
  );
}
