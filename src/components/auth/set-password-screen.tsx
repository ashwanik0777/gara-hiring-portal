"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { setNewPasswordAction } from "@/features/auth/password-actions";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  KeyRound,
  ArrowRight,
} from "lucide-react";

interface SetPasswordScreenProps {
  userEmail: string;
  userName: string;
  userRoles: string[];
}

export function SetPasswordScreen({
  userEmail,
  userName,
  userRoles,
}: SetPasswordScreenProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Password rules validation
  const rules = {
    length: newPassword.length >= 10,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  };

  const strengthCount = Object.values(rules).filter(Boolean).length;
  const strengthLabels = ["", "Very Weak", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = [
    "",
    "bg-rose-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-blue-500",
    "bg-emerald-500",
  ];
  const strengthTextColors = [
    "",
    "text-rose-500",
    "text-amber-500",
    "text-yellow-500",
    "text-blue-500",
    "text-emerald-500",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (strengthCount < 5) {
      setErrorMsg("Please satisfy all password complexity requirements.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    setIsPending(true);
    try {
      const res = await setNewPasswordAction({ newPassword });
      if (!res.success) {
        setErrorMsg(res.error || "Failed to update password.");
        setIsPending(false);
        return;
      }

      setIsSuccess(true);
      const destination = res.redirectTo ?? "/dashboard";
      setTimeout(() => {
        router.replace(destination);
      }, 1200);
    } catch {
      setErrorMsg("An unexpected error occurred. Please try again.");
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-card border border-border/80 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary mb-2 shadow-2xs">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            Set Permanent Password
          </h1>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            You signed in with a temporary password. Choose a new secure password to protect your account.
          </p>
        </div>

        {/* User Identity Pill */}
        <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{userName}</p>
            <p className="text-[11px] text-muted-foreground font-mono truncate">{userEmail}</p>
          </div>
          <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 shrink-0">
            {userRoles[0] || "STAFF"}
          </span>
        </div>

        {/* Error / Success Alerts */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isSuccess && (
          <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Password saved! Redirecting to your dashboard...</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
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
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Strength Meter */}
          {newPassword.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Password strength:</span>
                <span className={`font-bold ${strengthTextColors[strengthCount]}`}>
                  {strengthLabels[strengthCount]}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <div
                    key={lvl}
                    className={`h-full rounded-full transition-all duration-300 ${
                      lvl <= strengthCount ? strengthColors[strengthCount] : "bg-transparent"
                    }`}
                  />
                ))}
              </div>

              {/* Requirement Checklist */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] pt-1">
                <div className={`flex items-center gap-1 ${rules.length ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  <CheckCircle2 className="h-3 w-3 shrink-0" /> 10+ characters
                </div>
                <div className={`flex items-center gap-1 ${rules.uppercase ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  <CheckCircle2 className="h-3 w-3 shrink-0" /> Uppercase letter
                </div>
                <div className={`flex items-center gap-1 ${rules.lowercase ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  <CheckCircle2 className="h-3 w-3 shrink-0" /> Lowercase letter
                </div>
                <div className={`flex items-center gap-1 ${rules.number ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  <CheckCircle2 className="h-3 w-3 shrink-0" /> Number (0-9)
                </div>
                <div className={`flex items-center gap-1 col-span-2 ${rules.special ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  <CheckCircle2 className="h-3 w-3 shrink-0" /> Special character (!@#$%^&*)
                </div>
              </div>
            </div>
          )}

          {/* Confirm Password */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                title={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isPending || isSuccess || strengthCount < 5 || newPassword !== confirmPassword}
            className="w-full h-11 text-xs font-bold rounded-xl mt-2 gap-1.5 shadow-sm"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving Password...
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Password Set
              </>
            ) : (
              <>
                Save Password & Continue <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </form>

        {/* Security Footer Notice */}
        <div className="flex items-center gap-2 justify-center text-[11px] text-muted-foreground pt-2 border-t border-border/50">
          <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Passwords are stored only as salted, one-way hashes</span>
        </div>
      </div>
    </div>
  );
}
