import React from "react";
import { SelfServiceShell } from "@/features/lifecycle/components/self-service-shell";

/**
 * Evaluation / intern workspace shell. Pages check the workspace capability, so only
 * users selected for the evaluation or joined as interns can open them.
 */
export async function InternShell({ children }: { children: React.ReactNode }) {
  return <SelfServiceShell loginCallbackPath="/intern/dashboard">{children}</SelfServiceShell>;
}
