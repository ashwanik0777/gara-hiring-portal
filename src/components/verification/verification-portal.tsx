"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShieldCheck,
  AlertTriangle,
  Calendar,
  Award,
  UserCheck,
  Search,
  Copy,
  Check,
  Share2,
  Printer,
  Lock,
  ArrowRight,
  RefreshCw,
  FileCheck,
  CheckCircle2,
} from "lucide-react";

interface VerificationResult {
  valid: boolean;
  status?: string;
  verificationCode?: string;
  recipientName?: string;
  programmeTitle?: string;
  issueDate?: string;
  completionDate?: string;
  signatoryTitle?: string;
  signatoryName?: string;
  evaluationRequirementsFulfilled?: boolean;
  error?: string;
}

const MAX_CODE_LENGTH = 64;

export function VerificationPortal() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialCode = searchParams.get("code") || "";

  const [inputCode, setInputCode] = useState(initialCode);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [, startTransition] = useTransition();

  // If initial code is in URL on mount, auto-verify
  useEffect(() => {
    if (initialCode.trim()) {
      handleVerify(initialCode.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function handleVerify(codeToVerify?: string) {
    const target = (codeToVerify ?? inputCode).trim().toUpperCase().slice(0, MAX_CODE_LENGTH);
    if (!target) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/certificates/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: target }),
      });

      const data = await res.json();
      if (data.result) {
        setResult(data.result);
        startTransition(() => {
          router.replace(`/verify?code=${encodeURIComponent(target)}`, {
            scroll: false,
          });
        });
      } else {
        setResult({
          valid: false,
          error: data.error || "Unable to locate certificate with this code.",
        });
      }
    } catch {
      setResult({
        valid: false,
        error: "Verification service temporarily unreachable. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, type: "code" | "link") {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleReset() {
    setInputCode("");
    setResult(null);
    router.replace("/verify", { scroll: false });
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* ─── Page Title Header (Clean, No Subtitle, Standard Website Style) ─── */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Official Public Registry</span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
          Verify Certificate
        </h1>
      </div>

      {/* ─── Search Console Card (Width 7xl Friendly, Clean Solid Styling) ─── */}
      <div className="max-w-3xl mx-auto mb-12">
        <div className="rounded-2xl bg-card border border-border/80 shadow-sm p-6 sm:p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify();
            }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="verificationCode"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
              >
                <Lock className="h-3.5 w-3.5 text-primary" />
                <span>Certificate Verification Code</span>
              </label>
              {inputCode && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Input Bar + Action Button */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  id="verificationCode"
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  maxLength={MAX_CODE_LENGTH}
                  placeholder="Code printed on the certificate"
                  className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm sm:text-base font-mono tracking-wider text-foreground placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary uppercase shadow-2xs"
                  disabled={loading}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !inputCode.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Verify Now</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      </div>

      {/* ─── Verification Results (When active) ─── */}
      {result && (
        <div className="max-w-4xl mx-auto mb-16 animate-in fade-in-50 duration-200">
          {result.valid ? (
            /* Verified Credential Document Presentation */
            <div className="rounded-2xl bg-card border-2 border-emerald-500/40 shadow-md overflow-hidden">
              <div className="p-6 sm:p-10">
                {/* Status Seal Header */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-border">
                  <div className="flex items-center gap-3.5 text-center sm:text-left">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                      <ShieldCheck className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-500/20">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>AUTHENTIC & VERIFIED</span>
                      </div>
                      <h2 className="text-xl font-bold text-foreground mt-1 tracking-tight">
                        Certificate of Completion
                      </h2>
                    </div>
                  </div>

                  {/* Print & Share Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleCopy(
                          typeof window !== "undefined"
                            ? `${window.location.origin}/verify/${result.verificationCode}`
                            : "",
                          "link"
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                      title="Copy Public Verification Link"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Share Link</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handlePrint}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                      title="Print Certificate Verification Statement"
                    >
                      <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>

                {/* Certificate Document Content */}
                <div className="py-8 space-y-6">
                  {/* Recipient Headline Box */}
                  <div className="p-6 rounded-2xl bg-muted/30 border border-border/80 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      This Credential Is Awarded To
                    </p>
                    <p className="text-2xl sm:text-4xl font-extrabold text-foreground mt-1.5 tracking-tight font-[family-name:var(--font-display)]">
                      {result.recipientName}
                    </p>
                  </div>

                  {/* Metadata Grid */}
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

                  {/* Reference ID Pill with 1-Click Copy */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                          Verification Reference ID
                        </span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-foreground">
                          {result.verificationCode}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(result.verificationCode || "", "code")
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border hover:bg-muted text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 text-muted-foreground" />
                          <span>Copy ID</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Registry Record Callout (claims only what the record shows) */}
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

                {/* Reset / Search Another */}
                <div className="pt-2 text-center border-t border-border">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Verify another certificate</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Verification Failed / Revoked Card */
            <div className="rounded-2xl bg-card border-2 border-destructive/30 shadow-md p-6 sm:p-8">
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
                <p className="text-sm text-center text-muted-foreground leading-relaxed">
                  {result.error ||
                    "No valid certificate matches this reference ID. Please check the code and try again."}
                </p>

                <div className="p-4 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground space-y-2">
                  <p className="font-bold text-foreground">Troubleshooting Tips:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Confirm the verification code printed on the physical certificate.</li>
                    <li>Scan the QR code printed on the bottom corner of the official PDF document.</li>
                    <li>Verification codes start with <code className="font-mono text-foreground font-semibold">GARA-CERT-</code>.</li>
                  </ul>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Try another code</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Trust Pillars (Spanning Full 7xl Width) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-12">
        <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-2xs">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-foreground text-sm mb-1.5">
            Registry Lookup
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every certificate carries a randomly generated verification code that is checked against GARA Innovation&apos;s certificate records.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-2xs">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-foreground text-sm mb-1.5">
            Supervised Evaluation
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Certificates are issued only after the supervised evaluation is recorded as passed and authorized staff approve completion.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-2xs">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
            <FileCheck className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-foreground text-sm mb-1.5">
            Public Verification
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Employers, universities, and background verifiers can confirm a certificate without seeing contact details or internal evaluation notes.
          </p>
        </div>
      </div>

      {/* ─── Bottom Info Strip ─── */}
      <div className="p-6 rounded-2xl bg-card border border-border/80 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-foreground">
            Looking for internship opportunities or full-time roles?
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Complete our supervised evaluation to earn your verified GARA Innovation credential.
          </p>
        </div>
        <Link
          href="/careers"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-2xs shrink-0"
        >
          <span>Explore Openings</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
