"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  MailCheck,
} from "lucide-react";
import { getPostLoginRedirectAction } from "@/features/auth/password-actions";
import { sanitizeCallbackPath } from "@/lib/auth/redirects";

interface AuthSplitScreenProps {
  initialMode: "login" | "register" | "forgot";
}

export function AuthSplitScreen({ initialMode }: AuthSplitScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prevent open redirect: only same-origin relative paths are accepted
  const callbackUrl = sanitizeCallbackPath(searchParams.get("callbackUrl"));

  const [mode, setMode] = useState<"login" | "register" | "forgot">(initialMode);

  // If already authenticated on the client, replace route immediately to prevent viewing auth screens
  const { data: session, isPending: sessionPending } = authClient.useSession();
  useEffect(() => {
    if (!sessionPending && session?.user) {
      router.replace(callbackUrl);
    }
  }, [session, sessionPending, callbackUrl, router]);

  // Sync mode with browser back/forward buttons
  useEffect(() => {
    function handlePopState() {
      const path = window.location.pathname;
      if (path.includes("/register")) {
        setMode("register");
      } else if (path.includes("/forgot-password")) {
        setMode("forgot");
      } else if (path.includes("/login")) {
        setMode("login");
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const switchMode = useCallback(
    (newMode: "login" | "register" | "forgot") => {
      setMode(newMode);
      const query = window.location.search;
      const targetUrl =
        newMode === "register"
          ? `/register${query}`
          : newMode === "forgot"
            ? `/forgot-password${query}`
            : `/login${query}`;
      window.history.pushState(null, "", targetUrl);
    },
    []
  );

  // ─── LOGIN STATE ───
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginGoogleLoading, setLoginGoogleLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ─── REGISTER STATE ───
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regGoogleLoading, setRegGoogleLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // ─── FORGOT PASSWORD STATE ───
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Password Strength
  const checks = {
    length: regPassword.length >= 8,
    uppercase: /[A-Z]/.test(regPassword),
    number: /[0-9]/.test(regPassword),
    special: /[^A-Za-z0-9]/.test(regPassword),
  };
  const strength = Object.values(checks).filter(Boolean).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500"][strength];
  const strengthTextColor = ["", "text-red-500", "text-amber-500", "text-blue-500", "text-emerald-500"][strength];

  // ─── LOGIN HANDLER ───
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const { error } = await authClient.signIn.email({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setLoginError(error.message || "Invalid email or password. Please try again.");
        setLoginLoading(false);
        return;
      }

      // Check if the signed-in session still uses a temporary password
      const { redirectTo } = await getPostLoginRedirectAction();
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setLoginError("An unexpected authentication error occurred. Please try again.");
      setLoginLoading(false);
    }
  };

  const handleLoginGoogle = async () => {
    setLoginGoogleLoading(true);
    setLoginError(null);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
    } catch {
      setLoginError("Google Sign-In failed or is not configured yet in this environment.");
      setLoginGoogleLoading(false);
    }
  };

  // ─── REGISTER HANDLER ───
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (regPassword.length < 8) {
      setRegError("Password must be at least 8 characters long.");
      return;
    }

    if (!agreeTerms) {
      setRegError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setRegLoading(true);

    try {
      const { error } = await authClient.signUp.email({
        name: regName,
        email: regEmail,
        password: regPassword,
      });

      if (error) {
        setRegError(error.message || "Failed to create account. Email may already be registered.");
        setRegLoading(false);
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setRegError("An unexpected registration error occurred. Please try again.");
      setRegLoading(false);
    }
  };

  const handleRegisterGoogle = async () => {
    setRegGoogleLoading(true);
    setRegError(null);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
    } catch {
      setRegError("Google Sign-In failed or is not configured yet in this environment.");
      setRegGoogleLoading(false);
    }
  };

  // ─── FORGOT PASSWORD HANDLER ───
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);

    try {
      const { error } = await authClient.requestPasswordReset({
        email: forgotEmail.trim(),
        redirectTo: "/reset-password",
      });
      setForgotLoading(false);
      if (error) {
        setForgotError(
          error.status === 429
            ? "Too many reset requests. Please wait a few minutes and try again."
            : "Failed to process password recovery request."
        );
      } else {
        setForgotSubmitted(true);
      }
    } catch {
      setForgotLoading(false);
      setForgotError("An unexpected error occurred while resetting password. Please try again.");
    }
  };

  const isHeroOnLeft = mode === "login" || mode === "forgot";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ── Top Floating Back Button ── */}
      <div className="absolute top-5 left-5 z-50">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground backdrop-blur-md border border-border/70 shadow-xs transition-all hover:-translate-x-0.5 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </Link>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP SLIDING SPLIT SCREEN (>= 1024px)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block relative w-full min-h-screen overflow-hidden">
        {/* ─── SLIDING DARK BRAND HERO PANEL (56% Width with Seamless Wave) ─── */}
        <div
          className={`absolute top-0 bottom-0 w-[56%] z-20 transition-all duration-700 ease-in-out pointer-events-none ${
            isHeroOnLeft ? "left-0" : "left-[44%]"
          }`}
        >
          {/* Background SVG Canvas with Organic Curvy Edge */}
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className={`absolute inset-0 h-full w-full pointer-events-none transition-transform duration-700 ${
              isHeroOnLeft ? "" : "scale-x-[-1]"
            }`}
          >
            <defs>
              <linearGradient id="heroGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#051021" />
                <stop offset="45%" stopColor="#081a34" />
                <stop offset="100%" stopColor="#050e1c" />
              </linearGradient>
            </defs>
            <path
              d="M 0 0 L 880 0 C 880 120, 830 180, 830 280 C 830 380, 980 440, 980 560 C 980 680, 840 760, 840 860 C 840 930, 880 970, 880 1000 L 0 1000 Z"
              fill="url(#heroGradient)"
            />
          </svg>

          {/* Floating Translucent Decorative Squircles */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-16 left-12 w-28 h-28 rounded-3xl border border-white/[0.07] rotate-12" />
            <div className="absolute top-28 right-24 w-36 h-36 rounded-3xl border border-white/[0.05] -rotate-12" />
            <div className="absolute bottom-28 left-16 w-32 h-32 rounded-3xl border border-white/[0.06] -rotate-6" />
            <div className="absolute bottom-20 right-28 w-24 h-24 rounded-2xl border border-white/[0.07] rotate-45" />
            <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-blue-500/15 blur-[110px]" />
          </div>

          {/* Hero Content (Positioned in middle, pointer-events-auto) */}
          <div
            className={`relative z-10 h-full flex flex-col justify-between py-12 xl:py-16 px-8 xl:px-12 select-none pointer-events-auto transition-all duration-700 ${
              isHeroOnLeft ? "w-[85%] mr-auto" : "w-[85%] ml-auto"
            }`}
          >
            {/* Top Empty Space */}
            <div className="h-6" />

            {/* ─── Centered Brand Identity Lockup (Exact match to SS2) ─── */}
            <div className="flex flex-col items-center justify-center text-center my-auto w-full max-w-lg mx-auto">
              <div className="flex items-center justify-center gap-6 xl:gap-8 mb-6 w-full">
                {/* 3D GARA Emblem from User Image 1 Asset */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 xl:w-36 xl:h-36 shrink-0">
                  <div className="absolute inset-0 rounded-full bg-blue-500/25 blur-2xl -z-10" />
                  <Image
                    src="/brand/gara-emblem.png"
                    alt="GARA Innovation"
                    fill
                    sizes="(max-width: 640px) 112px, (max-width: 1280px) 128px, 144px"
                    className="object-contain drop-shadow-[0_16px_32px_rgba(37,99,235,0.45)]"
                    priority
                  />
                </div>

                {/* Brand Typography (G A R A + INNOVATION + Tagline) */}
                <div className="flex flex-col items-start justify-center text-left">
                  {/* G A R A - Large bold futuristic font with wide tracking */}
                  <h1 className="font-[family-name:var(--font-display)] text-5xl sm:text-6xl xl:text-7xl font-extrabold tracking-[0.28em] text-white select-none leading-none pl-1">
                    GARA
                  </h1>

                  {/* ─── INNOVATION ─── with cyan line wings */}
                  <div className="flex items-center gap-3 mt-3 w-full">
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-cyan-400/80 to-cyan-400" />
                    <span className="text-xs sm:text-sm xl:text-base font-bold tracking-[0.35em] text-[#22d3ee] uppercase shrink-0">
                      INNOVATION
                    </span>
                    <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent via-cyan-400/80 to-cyan-400" />
                  </div>

                  {/* INNOVATE • EMPOWER • ELEVATE with glowing cyan dots */}
                  <div className="text-[10px] sm:text-[11px] xl:text-xs font-bold tracking-[0.22em] text-white/90 flex items-center gap-2.5 uppercase mt-3">
                    <span>INNOVATE</span>
                    <span className="h-2 w-2 rounded-full bg-[#06b6d4] shadow-[0_0_10px_#06b6d4]" />
                    <span>EMPOWER</span>
                    <span className="h-2 w-2 rounded-full bg-[#06b6d4] shadow-[0_0_8px_#06b6d4]" />
                    <span>ELEVATE</span>
                  </div>
                </div>
              </div>

              {/* Tagline Subtitle tailored for GARA Internship Platform */}
              <p className="text-sm xl:text-base text-blue-100/80 max-w-md mx-auto leading-relaxed font-normal mb-8 text-center">
                Structured internship cohorts, 7-day supervised evaluations, and official verified credentials.
              </p>

              {/* 3 Metrics Grid tailored for GARA Innovation */}
              <div className="grid grid-cols-3 divide-x divide-white/10 max-w-md mx-auto w-full text-center py-4 mb-4 bg-white/[0.03] rounded-2xl border border-white/[0.07] backdrop-blur-xs">
                <div className="px-3">
                  <div className="text-xl xl:text-2xl font-bold text-white tracking-tight">7-DAY</div>
                  <div className="text-[10px] xl:text-[11px] uppercase tracking-wider text-blue-200/70 font-semibold mt-0.5">
                    EVALUATION
                  </div>
                </div>
                <div className="px-3">
                  <div className="text-xl xl:text-2xl font-bold text-white tracking-tight">100%</div>
                  <div className="text-[10px] xl:text-[11px] uppercase tracking-wider text-blue-200/70 font-semibold mt-0.5">
                    VERIFIED
                  </div>
                </div>
                <div className="px-3">
                  <div className="text-xl xl:text-2xl font-bold text-white tracking-tight">24/7</div>
                  <div className="text-[10px] xl:text-[11px] uppercase tracking-wider text-blue-200/70 font-semibold mt-0.5">
                    SUPPORT
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Security Footer */}
            <div className="text-center text-xs text-blue-200/60 flex items-center justify-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-400/80" />
              <span>SOC 2 Compliant • SSL Encrypted • GDPR Ready</span>
            </div>
          </div>
        </div>

        {/* ─── SLIDING FORM PANEL (50% Width) ─── */}
        <div
          className={`absolute top-0 bottom-0 w-1/2 z-10 transition-all duration-700 ease-in-out flex items-center justify-center p-8 xl:p-14 ${
            isHeroOnLeft ? "left-1/2" : "left-0"
          }`}
        >
          <div className="w-full max-w-md relative">
            {/* ─── 1. LOGIN FORM (Visible when mode === "login") ─── */}
            <div
              className={`transition-all duration-500 ${
                mode === "login"
                  ? "opacity-100 pointer-events-auto transform translate-y-0"
                  : "opacity-0 pointer-events-none transform -translate-y-4 absolute inset-0"
              }`}
            >
              <div className="space-y-6">
                {/* Title */}
                <div className="text-center space-y-1.5">
                  <h2 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-foreground">
                    Your Career Journey Continues
                  </h2>
                  {/* <p className="text-xs xl:text-sm text-muted-foreground">
                    Sign in to your account to continue
                  </p> */}
                </div>

                {/* Google Sign In */}
                <button
                  type="button"
                  disabled={loginLoading || loginGoogleLoading}
                  onClick={handleLoginGoogle}
                  className="w-full h-11 px-4 rounded-xl border border-border/80 hover:bg-muted/60 text-foreground text-xs font-semibold flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-2xs"
                >
                  {loginGoogleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  )}
                  <span>Continue with Google</span>
                </button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/80" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-3 text-[11px] text-muted-foreground uppercase tracking-wider">
                      or continue with email
                    </span>
                  </div>
                </div>

                {/* Error */}
                {loginError && (
                  <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5 animate-fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Email Address</label>
                    <div className="relative flex items-center">
                      <Mail className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Password</label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        type={showLoginPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        className="w-full h-11 pl-10 pr-10 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-1"
                        aria-label="Toggle password"
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="rounded border-border accent-blue-600 cursor-pointer"
                        />
                        <span className="text-muted-foreground hover:text-foreground transition-colors text-xs">
                          Remember me
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loginLoading || loginGoogleLoading}
                    className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.99]"
                  >
                    {loginLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Security Tag */}
                <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1.5 pt-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                  Protected with optional two-factor authentication
                </p>

                {/* Switch to Signup */}
                <div className="pt-4 border-t border-border/60 text-center">
                  <p className="text-xs text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      Create account
                    </button>
                  </p>
                </div>
              </div>
            </div>

            {/* ─── 2. REGISTER FORM (Visible when mode === "register") ─── */}
            <div
              className={`transition-all duration-500 ${
                mode === "register"
                  ? "opacity-100 pointer-events-auto transform translate-y-0"
                  : "opacity-0 pointer-events-none transform translate-y-4 absolute inset-0"
              }`}
            >
              <div className="space-y-6">
                {/* Title (Free trial tagline completely removed as requested) */}
                <div className="text-center space-y-1.5">
                  <h2 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-foreground">
                    Your Career Starts Here
                  </h2>
                </div>

                {/* Google Sign In */}
                <button
                  type="button"
                  disabled={regLoading || regGoogleLoading}
                  onClick={handleRegisterGoogle}
                  className="w-full h-11 px-4 rounded-xl border border-border/80 hover:bg-muted/60 text-foreground text-xs font-semibold flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-2xs"
                >
                  {regGoogleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  )}
                  <span>Continue with Google</span>
                </button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/80" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-3 text-[11px] text-muted-foreground uppercase tracking-wider">
                      or continue with email
                    </span>
                  </div>
                </div>

                {/* Error */}
                {regError && (
                  <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5 animate-fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{regError}</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Full Name</label>
                    <div className="relative flex items-center">
                      <User className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        required
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Email Address</label>
                    <div className="relative flex items-center">
                      <Mail className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="email"
                        placeholder="you@company.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        required
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Password</label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        type={showRegPassword ? "text" : "password"}
                        placeholder="Create a strong password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        required
                        className="w-full h-11 pl-10 pr-10 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-3 text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-1"
                        aria-label="Toggle password"
                      >
                        {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {regPassword.length > 0 && (
                      <div className="space-y-2 pt-1 animate-fade-in">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex gap-1">
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                  i <= strength ? strengthColor : "bg-border/60"
                                }`}
                              />
                            ))}
                          </div>
                          <span className={`text-[11px] font-semibold shrink-0 ${strengthTextColor}`}>
                            {strengthLabel}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Agree Terms */}
                  <label className="flex items-start gap-2.5 cursor-pointer pt-1 select-none">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      required
                      className="mt-0.5 rounded border-border accent-blue-600 cursor-pointer shrink-0"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      I agree to the{" "}
                      <Link href="/help" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link href="/help" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        Privacy Policy
                      </Link>
                    </span>
                  </label>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={regLoading || regGoogleLoading}
                    className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.99]"
                  >
                    {regLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Account</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Security Tag */}
                <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1.5 pt-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                  Your data is encrypted and never shared
                </p>

                {/* Switch to Login */}
                <div className="pt-4 border-t border-border/60 text-center">
                  <p className="text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </div>
            </div>

            {/* ─── 3. FORGOT PASSWORD FORM (Inlined in place of Login) ─── */}
            <div
              className={`transition-all duration-500 ${
                mode === "forgot"
                  ? "opacity-100 pointer-events-auto transform translate-y-0"
                  : "opacity-0 pointer-events-none transform translate-y-4 absolute inset-0"
              }`}
            >
              <div className="space-y-6">
                <div className="text-center space-y-1.5">
                  <h2 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-foreground">
                    Reset your password
                  </h2>
                  <p className="text-xs xl:text-sm text-muted-foreground">
                    Enter your email to receive password recovery instructions
                  </p>
                </div>

                {forgotSubmitted ? (
                  <div className="space-y-4 text-center py-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
                      <MailCheck className="h-6 w-6" />
                    </div>
                    <p className="text-sm text-foreground">
                      If an account matches <span className="font-semibold">{forgotEmail}</span>, a password reset link has been sent to that email.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The link is valid for 1 hour and can be used once. Your current password keeps working until you choose a new one. Please check your inbox and spam folders.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotSubmitted(false);
                        switchMode("login");
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                    >
                      <ArrowLeft className="h-4 w-4" /> Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    {forgotError && (
                      <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{forgotError}</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Email Address</label>
                      <div className="relative flex items-center">
                        <Mail className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="email"
                          placeholder="you@company.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          required
                          className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {forgotLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Sending instructions...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Reset Instructions</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="h-3 w-3" /> Back to sign in
                      </button>
                    </div>
                  </form>
                )}

                {/* Security Tag */}
                <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1.5 pt-2 border-t border-border/60">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                  SOC 2 Compliant • SSL Encrypted
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE / TABLET LAYOUT (< 1024px)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden min-h-screen py-16 px-4 sm:px-6 flex flex-col justify-center items-center">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-4 justify-center mb-3">
            <div className="relative w-14 h-14 shrink-0">
              <Image
                src="/brand/gara-emblem.png"
                alt="GARA Innovation"
                fill
                sizes="56px"
                className="object-contain drop-shadow-md"
                priority
              />
            </div>
            <div className="text-left">
              <span className="text-3xl font-extrabold tracking-[0.25em] text-foreground font-[family-name:var(--font-display)] leading-none block">
                GARA
              </span>
              <span className="text-[10px] font-bold tracking-[0.3em] text-cyan-500 uppercase">
                INNOVATION
              </span>
            </div>
          </Link>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Innovate • Empower • Elevate
          </p>
        </div>

        {/* Tab Switcher (When not in forgot mode) */}
        {mode !== "forgot" ? (
          <div className="w-full max-w-md mb-6 p-1 rounded-2xl bg-muted/60 border border-border/70 flex">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create Account
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md mb-4 text-center">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </button>
          </div>
        )}

        {/* Form Container Card */}
        <div className="w-full max-w-md rounded-3xl bg-card border border-border/80 p-6 sm:p-8 shadow-xl shadow-black/5">
          {mode === "login" ? (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-foreground">Welcome back</h2>
                <p className="text-xs text-muted-foreground">Sign in to your account</p>
              </div>

              {loginError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Email</label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-border/80 bg-background text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Password</label>
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-border/80 bg-background text-xs"
                  />
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs text-blue-600 hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                </button>
              </form>
            </div>
          ) : mode === "register" ? (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-foreground">Create account</h2>
              </div>

              {regError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Full Name</label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-border/80 bg-background text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Email</label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-border/80 bg-background text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Password</label>
                  <input
                    type={showRegPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-border/80 bg-background text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  {regLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-foreground">Reset password</h2>
                <p className="text-xs text-muted-foreground">Enter your email</p>
              </div>

              {forgotSubmitted ? (
                <div className="text-center space-y-3 py-2">
                  <div className="mx-auto w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
                    <MailCheck className="h-5 w-5" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    If an account matches <span className="font-semibold text-foreground">{forgotEmail}</span>, a password reset link has been sent. It is valid for 1 hour.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotSubmitted(false);
                      switchMode("login");
                    }}
                    className="text-xs text-blue-600 hover:underline font-semibold"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  {forgotError && (
                    <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{forgotError}</span>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Email</label>
                    <input
                      type="email"
                      placeholder="you@company.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      className="w-full h-10 px-3.5 rounded-xl border border-border/80 bg-background text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Instructions"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Mobile Security Footer */}
        <p className="text-[11px] text-muted-foreground mt-8 text-center flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
          SOC 2 Compliant • SSL Encrypted • GDPR Ready
        </p>
      </div>
    </div>
  );
}
