import React from "react";
import { SelfServiceShell } from "@/features/lifecycle/components/self-service-shell";

/**
 * Candidate portal shell. Navigation follows the user's lifecycle stage; after joining,
 * candidate-only pages redirect to the new home and applications become read-only history.
 */
export async function CandidateShell({ children }: { children: React.ReactNode }) {
  return <SelfServiceShell loginCallbackPath="/candidate/dashboard">{children}</SelfServiceShell>;
}
