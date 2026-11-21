"use client";

import React, { useState, useEffect, useTransition, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  EyeOff,
  QrCode,
  Route,
  Zap,
} from "lucide-react";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { PageHero, SectionHeading, StepCards } from "@/components/marketing/page-sections";

interface VerificationResult {
  valid: boolean;
  status?: string;
  verificationCode?: string;
  recipientName?: string;
  programmeTitle?: string;
  issueDate?: string;
  completionDate?: string;
  typeLabel?: string;
  periodStart?: string;
  revokedOn?: string;
  error?: string;
}

const MAX_CODE_LENGTH = 64;

function subscribeToHistory(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readCodeFromLocation(): string {
  return new URLSearchParams(window.location.search).get("code") ?? "";
}

export function VerificationPortal() {
  const router = useRouter();
  // `?code=` is read in the browser only: the server renders the empty form, so the page is
  // part of the static HTML (visible without JavaScript and in link previews) instead of a
  // loading placeholder, which useSearchParams would cause.
  const initialCode = useSyncExternalStore(subscribeToHistory, readCodeFromLocation, () => "");

  // The field shows the URL code until the person edits it.
  const [editedCode, setInputCode] = useState<string | null>(null);
  const inputCode = editedCode ?? initialCode;
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [, startTransition] = useTransition();

  // If a code is in the URL, verify it.
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
    <>
      <PageHero
        eyebrow={{ icon: ShieldCheck, label: "Official Public Registry" }}
        title={
          <>
            Verify <span className="text-primary">Certificate</span>
          </>
        }
      >
        <div className="mx-auto max-w-2xl text-left">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify();
            }}
            className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-lg shadow-primary/5 sm:p-6"
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="verificationCode"
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                <Lock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>Certificate Verification Code</span>
              </label>
              {inputCode && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="verificationCode"
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  maxLength={MAX_CODE_LENGTH}
                  placeholder="GARA-IC-2026-7K2QXM"
                  className="h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 font-mono text-sm uppercase tracking-wider text-foreground shadow-2xs placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 sm:text-base"
                  disabled={loading}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !inputCode.trim()}
                className="inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    <span>Verify Now</span>
                  </>
                )}
              </button>
            </div>
          </form>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <QrCode className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Scan the QR or type the ID
            </li>
            <li className="inline-flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> No contact details shown
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Instant result
            </li>
          </ul>
        </div>
      </PageHero>

      <div className={PAGE_GUTTER}>
      {/* ─── Verification Results (When active) ─── */}
      {result && (
        <div className="w-full pb-8 pt-8 animate-in fade-in-50 duration-200">
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
                        {result.typeLabel ?? "Certificate of Completion"}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-border bg-background">
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                        <Award className="h-4 w-4 text-primary" />
                        <span>Programme</span>
                      </div>
                      <p className="text-sm font-bold text-foreground">
                        {result.programmeTitle}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-background">
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                        <UserCheck className="h-4 w-4 text-primary" />
                        <span>Period</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground font-mono">
                        {result.periodStart ? `${result.periodStart} to ${result.completionDate}` : "—"}
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
                      {result.typeLabel ? `${result.typeLabel}. ` : ""}This certificate matches an active record in
                      GARA Innovation&apos;s certificate registry.
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
                    <li>
                      Certificate IDs look like <code className="font-mono text-foreground font-semibold">GARA-IC-2026-7K2QXM</code>{" "}
                      (older ones start with <code className="font-mono text-foreground font-semibold">GARA-CERT-</code>).
                    </li>
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

      </div>

      <section aria-labelledby="verify-how" className="border-t border-border/60 bg-muted/20 py-8 dark:bg-muted/5 lg:py-10">
        <div className={PAGE_GUTTER}>
          <SectionHeading id="verify-how" eyebrow={{ icon: Route, label: "How it works" }} title="Verification in three steps" />
          <StepCards
            columns={3}
            label="How certificate verification works"
            steps={[
              { icon: QrCode, title: "Scan or type", text: "Scan the QR code on the certificate, or type the certificate ID printed on it." },
              { icon: Search, title: "Registry lookup", text: "We look the ID up in GARA's certificate registry." },
              {
                icon: FileCheck,
                title: "See the result",
                text: "Valid or revoked, with the holder's name, programme and dates. Email addresses and phone numbers are never shown.",
              },
            ]}
          />
        </div>
      </section>

      <section aria-label="Why it can be trusted" className="py-8 lg:py-10">
        <div className={`${PAGE_GUTTER} space-y-6`}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                tone: "bg-primary/10 text-primary",
                title: "Unique Codes",
                text: "Every certificate carries a randomly generated verification code that is checked against GARA Innovation's certificate records.",
              },
              {
                icon: CheckCircle2,
                tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                title: "Issued by GARA",
                text: "Certificates are issued by authorised GARA staff once the programme's requirements are recorded as met.",
              },
              {
                icon: FileCheck,
                tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                title: "Public Verification",
                text: "Employers, universities, and background verifiers can confirm a certificate without seeing contact details or internal evaluation notes.",
              },
            ].map((pillar) => (
              <div key={pillar.title} className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
                <span aria-hidden="true" className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${pillar.tone}`}>
                  <pillar.icon className="h-5 w-5" />
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">{pillar.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{pillar.text}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-start gap-5 rounded-3xl border border-primary/20 bg-primary/5 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <p className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground">
              Looking for internship opportunities or full-time roles?
            </p>
            <Link
              href="/careers"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Explore Openings <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
