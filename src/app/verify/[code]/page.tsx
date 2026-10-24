import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { certificateService } from "@/features/certificates/services/certificate-service";
import { VERIFICATION_CODE_MAX_LENGTH } from "@/features/certificates/constants";
import type { PublicCertificateVerificationResult } from "@/features/certificates/types";
import { defaultRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { getClientIpHash } from "@/lib/security/client-ip";
import { RateLimitError } from "@/lib/errors";
import {
  ShieldCheck,
  AlertTriangle,
  Calendar,
  Award,
  UserCheck,
  ArrowLeft,
  Search,
  Lock,
  CheckCircle2,
} from "lucide-react";

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

interface VerifyPageProps {
  params: Promise<{ code: string }>;
}

function RateLimitedState() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div role="status" className="rounded-2xl bg-card border-2 border-warning/30 shadow-sm p-6 sm:p-8 text-center space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning border border-warning/20">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Too many verification requests</h1>
        <p className="text-sm text-muted-foreground">
          Please wait a minute and try again. This limit protects the certificate registry from automated lookups.
        </p>
        <Link
          href="/verify"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-2xs"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Back to Verification</span>
        </Link>
      </div>
    </div>
  );
}

export default async function VerifyCodePage({ params }: VerifyPageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.trim().slice(0, VERIFICATION_CODE_MAX_LENGTH);

  // BUG-23: public lookups are rate limited per client and logged with a keyed IP hash.
  const requestHeaders = await headers();
  const ipHash = getClientIpHash(requestHeaders, "certificate-verify");
  try {
    await defaultRateLimiter.enforce(ipHash, RATE_LIMIT_POLICIES.CERTIFICATE_VERIFY);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return <RateLimitedState />;
    }
    throw error;
  }

  const userAgent = requestHeaders.get("user-agent") ?? undefined;
  const result: PublicCertificateVerificationResult =
    rawCode.trim().length > VERIFICATION_CODE_MAX_LENGTH
      ? { valid: false }
      : await certificateService.verifyCertificatePublic(code, ipHash, userAgent);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
          <Lock className="h-3.5 w-3.5" />
          <span>Official Public Registry</span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Certificate Verification
        </h1>
      </div>

      {result.valid ? (
        /* Valid Certificate Card */
        <div className="rounded-2xl bg-card border-2 border-emerald-500/40 shadow-sm overflow-hidden">
          <div className="p-6 sm:p-10">
            <div className="text-center pb-6 border-b border-border">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-1 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>AUTHENTIC & VERIFIED</span>
              </div>
              <h2 className="text-xl font-bold text-foreground mt-1 tracking-tight">
                Certificate of Completion
              </h2>
            </div>

            <div className="pt-6 space-y-6">
              <div className="p-6 rounded-2xl bg-muted/30 border border-border/80 text-center">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Awarded To
                </p>
                <p className="text-2xl sm:text-4xl font-extrabold text-foreground mt-1.5 tracking-tight font-[family-name:var(--font-display)]">
                  {result.recipientName}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-border bg-background">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                    <Award className="h-4 w-4 text-primary" />
                    <span>Internship Programme</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {result.programmeTitle}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-background">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span>Authorized Signatory</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {result.signatoryName}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {result.signatoryTitle}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-background">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>Completion Date</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground font-mono">
                    {result.completionDate}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-background">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>Issue Date</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground font-mono">
                    {result.issueDate}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-center">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Verification Code
                </span>
                <span className="text-sm font-mono font-bold text-foreground">
                  {result.verificationCode}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-muted-foreground leading-relaxed flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-foreground block">
                    GARA Innovation Certificate Registry
                  </span>
                  {result.evaluationRequirementsFulfilled
                    ? "This certificate matches an active record in GARA Innovation's certificate registry. The record shows a passed supervised evaluation with every checkpoint reviewed and an approved completion decision."
                    : "This certificate matches an active record in GARA Innovation's certificate registry."}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Invalid / Failed Card */
        <div className="rounded-2xl bg-card border-2 border-destructive/30 shadow-sm p-6 sm:p-8">
          <div className="text-center pb-6 border-b border-border">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-bold mb-2">
              <span>
                {result.status === "REVOKED"
                  ? "CREDENTIAL REVOKED"
                  : result.status === "SUPERSEDED"
                    ? "CODE SUPERSEDED"
                    : "VERIFICATION FAILED"}
              </span>
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Invalid or Unverified Credential
            </h2>
          </div>

          <div className="pt-6 space-y-4">
            <div className="text-center font-mono text-xs text-muted-foreground">
              Query Code: <span className="font-bold text-foreground">{code}</span>
            </div>
            <p className="text-sm text-center text-muted-foreground leading-relaxed">
              {result.error ||
                "The credential could not be verified in our records. It may have been revoked, superseded, or entered with an incorrect verification ID."}
            </p>

            <div className="p-4 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
              <p className="font-bold text-foreground mb-1">Next steps:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Double-check the verification code printed on the physical certificate.</li>
                <li>Scan the QR code printed on the bottom right of the official PDF document.</li>
                <li>Contact GARA Innovation programmes team if you believe this is an error.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Action Navigation Buttons */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/verify"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-2xs"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Verify Another Certificate</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs font-semibold hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Home</span>
        </Link>
      </div>
    </div>
  );
}
