"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import {
  OTP_CODE_LENGTH,
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  describeOtpError,
  isCodeExhausted,
  maskEmail,
  normalizeOtpInput,
  type OtpResult,
} from "./otp-helpers";

export type OtpStepPurpose = "verify-email" | "sign-in";

interface OtpCodeStepProps {
  /** Unique per rendered copy (the desktop panel and the mobile layout each render one). */
  idPrefix: string;
  purpose: OtpStepPurpose;
  email: string;
  /** A code was just sent, so "Resend code" starts on its cooldown. */
  codeJustSent?: boolean;
  /** Shown when the step opens, e.g. when sending the first code failed. */
  initialError?: string | null;
  compact?: boolean;
  onVerify: (code: string) => Promise<OtpResult>;
  onResend: () => Promise<OtpResult>;
  onBack: () => void;
  backLabel: string;
}

const COPY: Record<OtpStepPurpose, { title: string; lead: string; submit: string; pending: string }> = {
  "verify-email": {
    title: "Verify your email",
    lead: "We sent a 6-digit code to",
    submit: "Verify email",
    pending: "Verifying...",
  },
  "sign-in": {
    title: "Enter the code we emailed you",
    lead: "For your security, we sent a 6-digit sign-in code to",
    submit: "Verify and sign in",
    pending: "Verifying...",
  },
};

/**
 * The emailed-code step used after sign-up (verify email) and after the password step of
 * sign-in. One labelled numeric input (paste-friendly, `autoComplete="one-time-code"`), a
 * Verify button with a pending state, and "Resend code" with a cooldown. Errors are mapped
 * to friendly text; raw error codes are never shown.
 */
export function OtpCodeStep({
  idPrefix,
  purpose,
  email,
  codeJustSent = true,
  initialError = null,
  compact = false,
  onVerify,
  onResend,
  onBack,
  backLabel,
}: OtpCodeStepProps) {
  const copy = COPY[purpose];
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "done">("idle");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(codeJustSent ? OTP_RESEND_COOLDOWN_SECONDS : 0);
  const coolingDown = secondsLeft > 0;

  const inputId = `${idPrefix}-code`;
  const hintId = `${idPrefix}-hint`;
  const errorId = `${idPrefix}-error`;
  const busy = status !== "idle";

  useEffect(() => {
    // Only the visible copy can take focus; the hidden layout's input ignores it.
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setInterval(() => {
      setSecondsLeft((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [coolingDown]);

  const updateCode = (value: string) => {
    setCode(normalizeOtpInput(value));
    setError(null);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = normalizeOtpInput(event.clipboardData.getData("text"));
    if (!pasted) return;
    // maxLength would cut a pasted message before the digits are extracted.
    event.preventDefault();
    updateCode(pasted);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (code.length !== OTP_CODE_LENGTH) {
      setError(`Enter the ${OTP_CODE_LENGTH}-digit code from the email.`);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setNotice(null);
    setStatus("verifying");
    let result: OtpResult;
    try {
      result = await onVerify(code);
    } catch {
      result = { ok: false, failure: { network: true } };
    }
    if (result.ok) {
      // The parent navigates away; keep the button disabled until it does.
      setStatus("done");
      return;
    }
    setStatus("idle");
    setError(describeOtpError(result.failure, "verify"));
    if (isCodeExhausted(result.failure)) {
      setCode("");
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleResend = async () => {
    if (coolingDown || resending || busy) return;
    setResending(true);
    setError(null);
    setNotice(null);
    let result: OtpResult;
    try {
      result = await onResend();
    } catch {
      result = { ok: false, failure: { network: true } };
    }
    setResending(false);
    if (result.ok) {
      setCode("");
      setNotice(`We sent a new code to ${maskEmail(email)}.`);
      setSecondsLeft(OTP_RESEND_COOLDOWN_SECONDS);
      inputRef.current?.focus();
      return;
    }
    setError(describeOtpError(result.failure, "resend"));
    if (result.failure.status === 429) {
      setSecondsLeft(OTP_RESEND_COOLDOWN_SECONDS);
    }
  };

  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      <div className={compact ? "text-center space-y-1" : "text-center space-y-2"}>
        {!compact && (
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <h2
          className={
            compact
              ? "text-xl font-bold text-foreground"
              : "text-2xl xl:text-3xl font-extrabold tracking-tight text-foreground"
          }
        >
          {copy.title}
        </h2>
        <p className="text-xs xl:text-sm text-muted-foreground">
          {copy.lead} <span className="font-semibold text-foreground">{maskEmail(email)}</span>.
        </p>
      </div>

      {error && (
        <div
          id={errorId}
          role="alert"
          className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="text-xs font-semibold text-foreground">
            Verification code
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="one-time-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_CODE_LENGTH}
            placeholder="••••••"
            value={code}
            onChange={(event) => updateCode(event.target.value)}
            onPaste={handlePaste}
            disabled={status === "done"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            className={`w-full ${compact ? "h-11" : "h-12"} px-3.5 rounded-xl border border-border/80 bg-background text-foreground text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/40 placeholder:tracking-[0.5em]`}
          />
          <p id={hintId} className="text-[11px] text-muted-foreground">
            The code expires in {OTP_EXPIRY_MINUTES} minutes. Check your spam folder if it hasn&apos;t arrived.
          </p>
        </div>

        <button
          type="submit"
          disabled={busy}
          className={`w-full ${compact ? "h-10 text-xs" : "h-11 text-sm"} rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{status === "done" ? "Signing you in..." : copy.pending}</span>
            </>
          ) : (
            <>
              <span>{copy.submit}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <div className="flex flex-col items-center gap-2 text-xs">
        <p aria-live="polite" className="text-muted-foreground text-center min-h-[1rem]">
          {notice}
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={coolingDown || resending || busy}
          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline inline-flex items-center gap-1.5"
        >
          {resending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Sending a new code...
            </>
          ) : coolingDown ? (
            `Resend code in ${secondsLeft}s`
          ) : (
            "Resend code"
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={status === "done"}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" /> {backLabel}
        </button>
      </div>

      <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
        Never share this code. GARA Innovation staff will never ask you for it.
      </p>
    </div>
  );
}
