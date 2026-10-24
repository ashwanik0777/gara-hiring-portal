"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

interface ResetPasswordScreenProps {
  token: string | null;
  tokenError: string | null;
}

export function ResetPasswordScreen({ token, tokenError }: ResetPasswordScreenProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const rules = {
    length: newPassword.length >= 10,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  };
  const allRulesMet = Object.values(rules).every(Boolean);
  const linkInvalid = !token || Boolean(tokenError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!token) {
      setErrorMsg("This reset link is invalid. Please request a new one.");
      return;
    }
    if (!allRulesMet) {
      setErrorMsg("Please satisfy all password complexity requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    setIsPending(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword, token });
      if (error) {
        setErrorMsg(
          error.status === 429
            ? "Too many attempts. Please wait a few minutes and try again."
            : "This reset link is invalid or has expired. Please request a new one."
        );
        setIsPending(false);
        return;
      }
      setIsSuccess(true);
      setTimeout(() => {
        router.replace("/login");
      }, 1500);
    } catch {
      setErrorMsg("An unexpected error occurred. Please try again.");
      setIsPending(false);
    }
  };

  const ruleClass = (met: boolean) =>
    `flex items-center gap-1 ${met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`;

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-card border border-border/80 shadow-lg rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary mb-2">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            Choose a New Password
          </h1>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Reset links are valid for 1 hour and can be used once. All other signed-in devices are signed out after the reset.
          </p>
        </div>

        {linkInvalid && (
          <div role="alert" className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>This reset link is invalid or has expired. Please request a new one.</span>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isSuccess && (
          <div role="status" className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Password updated. Redirecting to sign in...</span>
          </div>
        )}

        {linkInvalid ? (
          <Link
            href="/forgot-password"
            className="inline-flex w-full items-center justify-center gap-1.5 h-11 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Request a new reset link <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-new-password" className="text-xs font-semibold text-muted-foreground block mb-1.5">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="reset-new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
              <div className={ruleClass(rules.length)}>
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> 10+ characters
              </div>
              <div className={ruleClass(rules.uppercase)}>
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> Uppercase letter
              </div>
              <div className={ruleClass(rules.lowercase)}>
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> Lowercase letter
              </div>
              <div className={ruleClass(rules.number)}>
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> Number (0-9)
              </div>
              <div className={`${ruleClass(rules.special)} col-span-2`}>
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> Special character
              </div>
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="text-xs font-semibold text-muted-foreground block mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="reset-confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending || isSuccess || !allRulesMet || newPassword !== confirmPassword}
              className="w-full h-11 text-xs font-bold rounded-xl mt-2 gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving Password...
                </>
              ) : (
                <>
                  Reset Password <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        )}

        <div className="text-center pt-2 border-t border-border/50">
          <Link href="/login" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
