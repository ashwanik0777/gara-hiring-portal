import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  Users,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  CheckCircle2,
  CalendarCheck,
  Award,
  FileCheck,
  Zap,
  TrendingUp,
  Clock,
  FileSignature,
  QrCode,
  Sparkles,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 flex flex-col">
        {/* ──────────────── HERO SECTION ──────────────── */}
        <section className="relative overflow-hidden pt-16 pb-24 lg:pt-24 lg:pb-32">
          {/* Ambient background decorations */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {/* Large gradient orb - top right */}
            <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-primary/[0.07] blur-[100px] animate-pulse-slow" />
            {/* Smaller orb - bottom left */}
            <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full bg-primary/[0.05] blur-[80px] animate-pulse-slow [animation-delay:2s]" />
            {/* Dot grid pattern */}
            <div
              className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
              style={{
                backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
              {/* Left: Content */}
              <div className="lg:col-span-7 space-y-8 text-left">
                {/* Announcement pill */}
                <div className="animate-fade-in-down">
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 dark:bg-primary/15 px-4 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/20">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    Now Live — v1.0 Foundation Release
                  </span>
                </div>

                {/* Main heading with display font */}
                <h1 className="animate-fade-in-up font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                  Accelerating Talent
                  <br />
                  with{" "}
                  <span className="relative inline-block">
                    <span className="relative z-10 bg-gradient-to-r from-primary via-blue-500 to-indigo-500 bg-clip-text text-transparent">
                      Precision & Integrity
                    </span>
                  </span>
                </h1>

                {/* CTA buttons */}
                <div className="animate-fade-in-up [animation-delay:200ms] flex flex-wrap items-center gap-4 pt-2">
                  <Link href="/careers">
                    <Button size="lg" className="gap-2.5 text-sm font-semibold px-7 shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5">
                      Explore Opportunities
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/verify">
                    <Button variant="outline" size="lg" className="gap-2 text-sm font-semibold px-7 hover:-translate-y-0.5 transition-all duration-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Verify Certificate
                    </Button>
                  </Link>
                </div>

                {/* Trust indicators */}
                <div className="animate-fade-in-up [animation-delay:600ms] flex flex-wrap items-center gap-6 pt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-400/10">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="font-medium">RBAC Security</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-amber-400/10">
                      <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="font-medium">Verified Certificates</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-400/10">
                      <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <span className="font-medium">7-Day Evaluation</span>
                  </div>
                </div>
              </div>

              {/* Right: Brand visual */}
              <div className="lg:col-span-5 flex justify-center animate-slide-in-right [animation-delay:300ms]">
                <div className="relative w-full max-w-md">
                  {/* Floating glow behind card */}
                  <div className="absolute inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-blue-400/10 to-violet-500/20 blur-2xl animate-pulse-slow" aria-hidden="true" />
                  
                  {/* Main card */}
                  <div className="relative rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm p-8 shadow-xl shadow-black/[0.04] dark:shadow-black/[0.15] space-y-6">
                    {/* Logo */}
                    <div className="flex justify-center">
                      <div className="relative">
                        <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-primary/20 to-blue-400/20 blur-lg opacity-60 animate-pulse-slow" />
                        <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-white p-1.5 border border-border/40 shadow-sm">
                          <Image
                            src="/brand/gara-logo.png"
                            alt="GARA Innovation Brand"
                            width={96}
                            height={96}
                            className="object-contain w-full h-full"
                            priority
                          />
                        </div>
                      </div>
                    </div>

                    {/* Brand name */}
                    <h2 className="text-center font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground">
                      GARA Innovation
                    </h2>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: "7-Day", label: "Evaluation", color: "text-primary" },
                        { value: "QR", label: "Certificates", color: "text-emerald-600 dark:text-emerald-400" },
                        { value: "RBAC", label: "Security", color: "text-violet-600 dark:text-violet-400" },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-xl bg-muted/50 dark:bg-muted/30 p-3 text-center hover:bg-muted/80 dark:hover:bg-muted/50 transition-colors duration-200"
                        >
                          <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Mini pipeline visualization */}
                    <div className="flex items-center justify-between gap-1 px-1">
                      {["Apply", "Interview", "Evaluate", "Offer", "Certify"].map((step, i) => (
                        <div key={step} className="flex items-center gap-1">
                          <div className="flex flex-col items-center gap-1">
                            <div className={`h-2.5 w-2.5 rounded-full ${i <= 3 ? "bg-primary" : "bg-muted-foreground/30"} transition-colors`} />
                            <span className="text-[9px] text-muted-foreground font-medium">{step}</span>
                          </div>
                          {i < 4 && (
                            <div className={`h-px w-4 sm:w-6 mb-3 ${i < 3 ? "bg-primary/50" : "bg-border"}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────── STATS BAR ──────────────── */}
        <section className="relative border-y border-border/60 bg-muted/30 dark:bg-muted/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { icon: Briefcase, value: "Full Pipeline", label: "Recruitment Engine", color: "text-primary" },
                { icon: CalendarCheck, value: "Structured", label: "Internship Lifecycle", color: "text-emerald-600 dark:text-emerald-400" },
                { icon: FileCheck, value: "Verifiable", label: "QR Certificates", color: "text-amber-600 dark:text-amber-400" },
                { icon: Users, value: "Enterprise", label: "HRMS Foundation", color: "text-violet-600 dark:text-violet-400" },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className={`animate-fade-in-up flex items-center gap-4 group`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card border border-border/60 shadow-xs group-hover:shadow-md group-hover:border-primary/30 transition-all duration-300`}>
                    <item.icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <div>
                    <p className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ──────────────── CORE PILLARS ──────────────── */}
        <section className="py-20 lg:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section header */}
            <div className="text-center max-w-2xl mx-auto mb-16 animate-fade-in-up">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold text-foreground mb-4">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Platform Architecture
              </span>
              <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                Integrated Lifecycle Architecture
              </h2>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {[
                {
                  icon: Briefcase,
                  title: "Recruitment Pipeline",
                  gradient: "from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20",
                  iconBg: "bg-blue-500/10 dark:bg-blue-500/20",
                  iconColor: "text-blue-600 dark:text-blue-400",
                  borderHover: "hover:border-blue-500/40",
                  features: [
                    "Versioned dynamic application forms",
                    "Multi-round interview scheduling with scorecards",
                    "Confidential notes isolated from candidate views",
                    "Historical archive for unselected applicants",
                  ],
                },
                {
                  icon: CalendarCheck,
                  title: "Internship Lifecycle",
                  gradient: "from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20",
                  iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
                  iconColor: "text-emerald-600 dark:text-emerald-400",
                  borderHover: "hover:border-emerald-500/40",
                  features: [
                    "Supervised evaluation period tracking",
                    "Intern task submissions and mentor reviews",
                    "Configurable progress reporting intervals",
                    "Verifiable PDF certificates with unique QR codes",
                  ],
                },
                {
                  icon: Users,
                  title: "Enterprise HRMS",
                  gradient: "from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20",
                  iconBg: "bg-violet-500/10 dark:bg-violet-500/20",
                  iconColor: "text-violet-600 dark:text-violet-400",
                  borderHover: "hover:border-violet-500/40",
                  features: [
                    "Core employee profiles and reporting lines",
                    "Policy-gated attendance records",
                    "Configurable leave management",
                    "Compliance-gated payroll processing",
                  ],
                },
              ].map((card, i) => (
                <div
                  key={card.title}
                  className={`animate-fade-in-up group relative rounded-2xl border border-border/60 bg-card p-6 lg:p-8 transition-all duration-300 hover:shadow-lg hover:shadow-black/[0.04] dark:hover:shadow-black/[0.15] hover:-translate-y-1 ${card.borderHover}`}
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  {/* Gradient background on hover */}
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  
                  <div className="relative space-y-5">
                    {/* Icon */}
                    <div className={`h-12 w-12 rounded-xl ${card.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      <card.icon className={`h-6 w-6 ${card.iconColor}`} />
                    </div>
                    
                    {/* Title */}
                    <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                      {card.title}
                    </h3>

                    {/* Feature list */}
                    <ul className="space-y-3">
                      {card.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground group-hover:text-foreground/80 transition-colors duration-300">
                          <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${card.iconColor} opacity-60 group-hover:opacity-100 transition-opacity`} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ──────────────── HOW IT WORKS / LIFECYCLE ROADMAP ──────────────── */}
        <section className="py-24 lg:py-28 border-t border-border/60 bg-muted/20 dark:bg-muted/5 relative overflow-hidden">
          {/* Subtle background ambient glow */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[350px] bg-primary/[0.04] dark:bg-primary/[0.07] blur-[120px] rounded-full" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto mb-16 sm:mb-20">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold text-foreground mb-4">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Internship Lifecycle
              </span>
              <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                From Application to Certificate
              </h2>
              {/* <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
                A structured, outcome-driven roadmap designed to evaluate talent fairly, provide flexible engagement, and reward completion with verifiable credentials.
              </p> */}
            </div>

            {/* 3x2 Serpentine Pipeline Grid (01 -> 02 -> 03 then down to 04 -> 05 -> 06 right-to-left) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-14 lg:gap-x-20 gap-y-16 lg:gap-y-20 relative md:pl-12 lg:pl-16">
              {[
                {
                  step: "01",
                  tag: "Stage 01",
                  phase: "Intake",
                  title: "Application & Profile",
                  desc: "Submit role-specific applications with verified credentials, academic records, and portfolio details.",
                  icon: FileCheck,
                  badgeIcon: ShieldCheck,
                  badge: "Verified Credentials",
                  meta: "Instant Submission",
                  desktopOrder: "md:order-1",
                  mobileOrder: "order-1",
                  flowDirection: "right",
                },
                {
                  step: "02",
                  tag: "Stage 02",
                  phase: "Screening",
                  title: "Structured Interviews",
                  desc: "Multi-round technical and problem-solving evaluations conducted through standardized assessment rubrics.",
                  icon: Users,
                  badgeIcon: FileSignature,
                  badge: "Objective Scorecard",
                  meta: "1–2 Rounds",
                  desktopOrder: "md:order-2",
                  mobileOrder: "order-2",
                  flowDirection: "right",
                },
                {
                  step: "03",
                  tag: "Stage 03",
                  phase: "Live Trial",
                  title: "7-Day Evaluation",
                  desc: "Hands-on supervised assessment where mentors measure real task delivery, execution speed, and team synergy.",
                  icon: CalendarCheck,
                  badgeIcon: Clock,
                  badge: "Task Delivery",
                  meta: "7 Working Days",
                  desktopOrder: "md:order-3",
                  mobileOrder: "order-3",
                  flowDirection: "down",
                },
                {
                  step: "04",
                  tag: "Stage 04",
                  phase: "Formal Offer",
                  title: "Offer & Custom Tenure",
                  desc: "Formal internship offer letter issued with duration tailored to candidate eligibility, college timeline, and role requirements.",
                  icon: Briefcase,
                  badgeIcon: Briefcase,
                  badge: "Tailored Duration",
                  meta: "Mutual Agreement",
                  desktopOrder: "md:order-6",
                  mobileOrder: "order-4",
                  flowDirection: "left",
                },
                {
                  step: "05",
                  tag: "Stage 05",
                  phase: "Active Work",
                  title: "Work & Extensions",
                  desc: "Milestone-driven project contributions. Tenure can be extended based on performance or completed flexibly on schedule.",
                  icon: TrendingUp,
                  badgeIcon: Sparkles,
                  badge: "Milestone Tracking",
                  meta: "Progress Driven",
                  desktopOrder: "md:order-5",
                  mobileOrder: "order-5",
                  flowDirection: "left",
                },
                {
                  step: "06",
                  tag: "Stage 06",
                  phase: "Credential",
                  title: "Verifiable Certificate",
                  desc: "Official tamper-proof completion certificate issued for completed duration, verifiable globally via secure cryptographic QR.",
                  icon: Award,
                  badgeIcon: QrCode,
                  badge: "Tamper-Proof QR",
                  meta: "Public Verification",
                  desktopOrder: "md:order-4",
                  mobileOrder: "order-6",
                  flowDirection: "complete",
                },
              ].map((item) => {
                const isComplete = item.flowDirection === "complete";

                return (
                  <div
                    key={item.step}
                    className={`group relative rounded-3xl border ${
                      isComplete
                        ? "border-emerald-500/40 bg-card/90 dark:bg-card/60 hover:border-emerald-500/80 hover:shadow-emerald-500/10"
                        : "border-border/80 bg-card/90 dark:bg-card/60 hover:border-primary/50 hover:shadow-primary/10"
                    } backdrop-blur-sm p-6 sm:p-7 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between ${item.mobileOrder} ${item.desktopOrder}`}
                  >
                    <div>
                      {/* Milestone Beacon Node */}
                      <div className="relative mb-5 inline-flex">
                        {/* Ambient soft glow aura */}
                        <div
                          className={`absolute -inset-1.5 rounded-2xl blur-lg transition-opacity duration-500 opacity-25 group-hover:opacity-100 ${
                            isComplete
                              ? "bg-emerald-500/30 dark:bg-emerald-400/30"
                              : "bg-primary/25 dark:bg-primary/30"
                          }`}
                        />

                        {/* Node Icon Housing */}
                        <div
                          className={`relative h-14 w-14 rounded-2xl border transition-all duration-300 shadow-xs flex items-center justify-center ${
                            isComplete
                              ? "bg-gradient-to-br from-background via-emerald-500/10 to-background border-emerald-500/30 text-emerald-600 dark:text-emerald-400 group-hover:border-emerald-500 group-hover:scale-105"
                              : "bg-gradient-to-br from-background via-primary/5 to-background border-primary/25 text-primary group-hover:border-primary group-hover:scale-105"
                          }`}
                        >
                          <item.icon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                        </div>

                        {/* Step Index Pill attached to Node */}
                        <span
                          className={`absolute -top-2 -right-2 text-[10px] font-black font-mono px-2 py-0.5 rounded-full shadow-xs tracking-tight ${
                            isComplete
                              ? "bg-emerald-600 text-white"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {item.step}
                        </span>
                      </div>

                      {/* Stage & Phase Breadcrumb */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider ${
                            isComplete
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-primary"
                          }`}
                        >
                          {item.tag}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {item.phase}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="font-[family-name:var(--font-display)] text-lg sm:text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-200">
                        {item.title}
                      </h3>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground leading-relaxed mt-2.5">
                        {item.desc}
                      </p>
                    </div>

                    {/* Bottom Editorial Capability Tag & Meta */}
                    <div className="mt-5 pt-3.5 border-t border-border/50 flex items-center justify-between text-xs">
                      <div className="inline-flex items-center gap-1.5 font-medium text-foreground/85">
                        <item.badgeIcon
                          className={`h-3.5 w-3.5 ${
                            isComplete ? "text-emerald-500" : "text-primary"
                          }`}
                        />
                        <span>{item.badge}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {item.meta}
                      </span>
                    </div>

                    {/* ── Continuous START Indicator (Desktop) ── */}
                    {item.step === "01" && (
                      <div
                        className="hidden md:flex absolute top-14 -translate-y-1/2 -left-12 lg:-left-16 items-center pointer-events-none z-10"
                        aria-hidden="true"
                      >
                        <span className="text-[10px] font-black tracking-widest text-primary/80 mr-2 font-mono">
                          START
                        </span>
                        <div className="relative flex items-center justify-center">
                          <div className="h-3 w-3 rounded-full bg-primary ring-4 ring-primary/25 shadow-xs" />
                          <div className="absolute h-3 w-3 rounded-full bg-primary animate-ping opacity-75" />
                        </div>
                        <div className="w-5 lg:w-9 h-[2px] bg-gradient-to-r from-primary to-primary/80 ml-1.5" />
                      </div>
                    )}

                    {/* ── Continuous Horizontal Connectors (Row 1: Rightward Flow 01->02, 02->03) ── */}
                    {(item.step === "01" || item.step === "02") && (
                      <div
                        className="hidden md:flex absolute top-14 -translate-y-1/2 left-full right-[-3.5rem] lg:right-[-5rem] z-10 items-center pointer-events-none"
                        aria-hidden="true"
                      >
                        <div className="flex-1 h-[2px] bg-gradient-to-r from-primary/80 via-primary/50 to-primary/80" />
                        <ArrowRight className="h-4 w-4 text-primary shrink-0 mx-2" />
                        <div className="flex-1 h-[2px] bg-gradient-to-r from-primary/80 via-primary/50 to-primary/80" />
                      </div>
                    )}

                    {/* ── Continuous Vertical Turn Down Connector (Row 1 -> Row 2: 03 -> 04) ── */}
                    {item.step === "03" && (
                      <div
                        className="hidden md:flex absolute -bottom-16 lg:-bottom-20 left-1/2 -translate-x-1/2 z-10 flex-col items-center pointer-events-none h-16 lg:h-20"
                        aria-hidden="true"
                      >
                        <div className="flex-1 w-[2px] bg-gradient-to-b from-primary/80 via-primary/50 to-primary/80" />
                        <ArrowDown className="h-4 w-4 text-primary shrink-0 my-1.5" />
                        <div className="flex-1 w-[2px] bg-gradient-to-b from-primary/80 via-primary/50 to-primary/80" />
                      </div>
                    )}

                    {/* ── Continuous Horizontal Connectors (Row 2: Leftward Flow 05->04, 06->05) ── */}
                    {(item.step === "05" || item.step === "06") && (
                      <div
                        className="hidden md:flex absolute top-14 -translate-y-1/2 left-full right-[-3.5rem] lg:right-[-5rem] z-10 items-center pointer-events-none"
                        aria-hidden="true"
                      >
                        <div className="flex-1 h-[2px] bg-gradient-to-l from-primary/80 via-primary/50 to-primary/80" />
                        <ArrowLeft className="h-4 w-4 text-primary shrink-0 mx-2" />
                        <div className="flex-1 h-[2px] bg-gradient-to-l from-primary/80 via-primary/50 to-primary/80" />
                      </div>
                    )}

                    {/* ── Continuous Mobile Vertical Timeline Track ── */}
                    {!isComplete && (
                      <div
                        className="md:hidden flex justify-center py-5 text-primary/60"
                        aria-hidden="true"
                      >
                        <div className="flex flex-col items-center">
                          <div className="h-4 w-[2px] bg-gradient-to-b from-primary/30 to-primary/80" />
                          <ArrowDown className="h-4 w-4 text-primary my-0.5" />
                          <div className="h-4 w-[2px] bg-gradient-to-b from-primary/80 to-primary/30" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* ──────────────── FOOTER ──────────────── */}
      <Footer />
    </div>
  );
}
