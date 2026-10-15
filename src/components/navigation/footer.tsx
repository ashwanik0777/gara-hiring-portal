"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Mail,
  CheckCircle2,
  ArrowRight,
  MapPin,
  HelpCircle,
  Heart,
  Bell,
} from "lucide-react";
import { VisitorCounter } from "@/components/analytics/visitor-counter";

export function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setSubscribed(true);
    setTimeout(() => {
      setSubscribed(false);
      setEmail("");
    }, 4000);
  }

  const socialLinks = [
    {
      name: "Facebook",
      href: "https://facebook.com/garainnovations",
      icon: (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      name: "Instagram",
      href: "https://instagram.com/gara_innovations",
      icon: (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      ),
    },
    {
      name: "X (Twitter)",
      href: "https://x.com/garainnovations",
      icon: (
        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      name: "LinkedIn",
      href: "https://linkedin.com/company/gara-innovation",
      icon: (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.64 1.64 0 1 0 0-3.28 1.64 1.64 0 0 0 0 3.28m1.4 9.74v-8.37H5.06v8.37z" />
        </svg>
      ),
    },
    {
      name: "YouTube",
      href: "https://youtube.com/@garainnovations",
      icon: (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
    },
    {
      name: "WhatsApp",
      href: "https://wa.me/919999999999",
      icon: (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.888 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413Z" />
        </svg>
      ),
    },
    {
      name: "Email",
      href: "mailto:garaworking007@gmail.com",
      icon: (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
        </svg>
      ),
    },
  ];

  return (
    <footer className="border-t border-border/80 bg-card/60">
      {/* ──────────────── TOP HIRING & COHORT ALERTS BANNER ──────────────── */}
      <div className="border-b border-border/60 bg-muted/20 dark:bg-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Heading & Pill */}
            <div className="lg:col-span-6 space-y-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-ping" />
                Direct Hiring & Cohort Alerts
              </span>
              <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Get notified the moment new internships & hiring drives open.
              </h2>
              {/* <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Subscribe with your email to receive direct alerts as soon as new technical roles, 
                internship cohorts, or evaluation windows are published at GARA Innovation.
              </p> */}
            </div>

            {/* Right: Email Subscription Form */}
            <div className="lg:col-span-6">
              {subscribed ? (
                <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium animate-fade-in shadow-xs">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Subscribed for hiring alerts!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You will receive an instant email notification the moment new roles or evaluation cohorts go live.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    <div className="relative w-full">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email for opening alerts..."
                        required
                        className="w-full h-11 pl-10 pr-4 rounded-xl border border-border/80 bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-2xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full sm:w-auto h-11 px-6 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-200 shrink-0 cursor-pointer hover:-translate-y-0.5"
                    >
                      <Bell className="h-4 w-4" />
                      Get Hiring Alerts
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Real-time opening notifications only. Zero spam. Unsubscribe anytime.</span>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────── MAIN MULTI-COLUMN FOOTER ──────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">
          {/* Column 1: Brand Info & Socials (Span 4) */}
          <div className="lg:col-span-4 space-y-5">
            <Link href="/" className="inline-flex items-center gap-3 group">
              <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-border/60 bg-white p-1 shadow-2xs">
                <Image
                  src="/brand/gara-logo.png"
                  alt="GARA Innovation"
                  width={44}
                  height={44}
                  className="object-contain w-full h-full"
                />
              </div>
              <div>
                <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-foreground block group-hover:text-primary transition-colors">
                  GARA INNOVATION
                </span>
                <span className="text-[10px] uppercase tracking-widest font-semibold text-primary block">
                  TALENT & HIRING PLATFORM
                </span>
              </div>
            </Link>

            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
              Empowering ambitious engineers and students through structured 7-day evaluations, 
              hands-on project execution, tailored tenures, and globally verifiable credentials.
            </p>

            {/* Horizontal Social Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {socialLinks.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.name}
                  aria-label={s.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted transition-all duration-200 cursor-pointer hover:scale-110"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Column 2: INTERNSHIPS & ROLES (Span 2) */}
          <div className="lg:col-span-2 space-y-3.5">
            <p className="font-[family-name:var(--font-display)] text-xs font-bold tracking-wider uppercase text-foreground">
              Open Roles
            </p>
            <ul className="space-y-2.5 text-xs text-muted-foreground">
              <li>
                <Link href="/careers" className="hover:text-foreground transition-colors">
                  Software Engineering
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-foreground transition-colors">
                  Full Stack & Web
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-foreground transition-colors">
                  UI/UX & Product Design
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-foreground transition-colors">
                  AI & Machine Learning
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-foreground transition-colors">
                  Cloud & Backend
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-primary font-medium transition-colors flex items-center gap-1 text-primary/90">
                  <span>View All Openings</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: CANDIDATE LIFECYCLE (Span 3) */}
          <div className="lg:col-span-3 space-y-3.5">
            <p className="font-[family-name:var(--font-display)] text-xs font-bold tracking-wider uppercase text-foreground">
              Candidate Lifecycle
            </p>
            <ul className="space-y-2.5 text-xs text-muted-foreground">
              <li>
                <Link href="/careers" className="hover:text-foreground transition-colors">
                  Application & Screening
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-foreground transition-colors">
                  7-Day Hands-on Evaluation
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-foreground transition-colors">
                  Offer & Tenure Model
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-foreground transition-colors">
                  Certificate QR Verification
                </Link>
              </li>
              <li>
                <Link href="/candidate/dashboard" className="hover:text-foreground transition-colors">
                  Candidate Portal & Status
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-foreground transition-colors">
                  Internship FAQs & Help
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: GET IN TOUCH & METRICS (Span 3) */}
          <div className="lg:col-span-3 space-y-4">
            <p className="font-[family-name:var(--font-display)] text-xs font-bold tracking-wider uppercase text-foreground">
              Support & Status
            </p>

            <div className="space-y-3 text-xs">
              {/* General info */}
              <div className="flex items-start gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-foreground block">Hiring & Enquiries</span>
                  <a
                    href="mailto:garaworking007@gmail.com"
                    className="text-muted-foreground hover:text-foreground transition-colors text-[11px]"
                  >
                    garaworking007@gmail.com
                  </a>
                </div>
              </div>

              {/* Support help */}
              <div className="flex items-start gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                  <HelpCircle className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-foreground block">Candidate Support</span>
                  <a
                    href="mailto:garaworking007@gmail.com"
                    className="text-muted-foreground hover:text-foreground transition-colors text-[11px]"
                  >
                    garaworking007@gmail.com
                  </a>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-start gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-foreground block">Operations</span>
                  <span className="text-muted-foreground text-[11px]">Remote-First & Hybrid Cohorts</span>
                </div>
              </div>
            </div>

            {/* Live Operational Status Chip */}
            {/* <div className="flex items-center gap-2 p-2.5 rounded-xl bg-card border border-border/80 shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] font-semibold text-foreground">
                All systems operational
              </span>
              <Activity className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
            </div> */}

            {/* Live Unique Visitors Tracker (Dynamic Backend-Powered) */}
            <VisitorCounter />
          </div>
        </div>
      </div>

      {/* ──────────────── BOTTOM ATTRIBUTION & LEGAL BAR ──────────────── */}
      <div className="border-t border-border/80 bg-background/80 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 items-center gap-4 text-xs text-muted-foreground">
            {/* Left: Copyright */}
            <div className="text-center lg:text-left justify-self-center lg:justify-self-start order-2 lg:order-1">
              <span>© {new Date().getFullYear()} <strong>GARA INNOVATION</strong>. All rights reserved.</span>
            </div>

            {/* Middle: Centered attribution with empty hollow heart, red border & soft pink shade */}
            <div className="text-center justify-self-center order-1 lg:order-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
                Architected & Engineered with
                <span className="inline-flex items-center justify-center p-1 rounded-full bg-pink-500/10 dark:bg-pink-500/15  shadow-[0_0_10px_rgba(244,114,182,0.25)] transition-transform hover:scale-110">
                  <Heart className="h-3.5 w-3.5 stroke-[2.2] stroke-red-500 fill-transparent text-transparent" />
                </span>
                by
                <a
                  href="https://www.gara-innovations.tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-foreground hover:text-primary transition-colors underline decoration-primary/40 underline-offset-4 hover:decoration-primary font-[family-name:var(--font-display)]"
                >
                  GARA INNOVATION
                </a>
              </span>
            </div>

            {/* Right: Legal links from reference */}
            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4 text-[11px] justify-self-center lg:justify-self-end order-3">
              <Link href="/help" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="/help" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link href="/help" className="hover:text-foreground transition-colors">
                Cookie Policy
              </Link>
              <Link href="/help" className="hover:text-foreground transition-colors">
                Sitemap
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
