import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BadgePercent,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Hourglass,
  Megaphone,
  QrCode,
  Route,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { JsonLd } from "@/components/seo/json-ld";
import { HighlightsBar, PageHero, SectionHeading, StepCards, primaryCta, secondaryCta } from "@/components/marketing/page-sections";
import { buildBreadcrumbJsonLd, ORGANIZATION_NAME } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { CAMPUS_AMBASSADOR_POLICY, TRAINING_POLICY } from "@/config/site";
import { formatInr } from "@/features/training/money";

const DESCRIPTION = `Represent ${ORGANIZATION_NAME} at your college as a Campus Ambassador: share Industrial Training with fellow students, earn a commission on paid enrollments made with your code once GARA approves your work, and get a verifiable certificate.`;

export const metadata: Metadata = {
  title: "Campus Ambassador Programme",
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/campus-ambassador") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/campus-ambassador"),
    siteName: ORGANIZATION_NAME,
    title: `Campus Ambassador Programme — ${ORGANIZATION_NAME}`,
    description: DESCRIPTION,
  },
};

const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

function ListCard({ icon: Icon, title, tone, items }: { icon: LucideIcon; title: string; tone: "primary" | "emerald"; items: React.ReactNode[] }) {
  const toneClass = tone === "emerald" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary";
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs sm:p-7">
      <h3 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
        <span aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        {title}
      </h3>
      <ul className="mt-5 space-y-3">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
            <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CampusAmbassadorPage() {
  const commission = formatInr(CAMPUS_AMBASSADOR_POLICY.commissionPaise);
  const payoutSteps: Array<{ icon: LucideIcon; title: string; text: string }> = [
    { icon: CheckCircle2, title: "Payment confirmed", text: "A commission is recorded when the student's payment is confirmed." },
    {
      icon: Hourglass,
      title: "Refund window closes",
      text: `${TRAINING_POLICY.refundHoursAfterFirstClass} hours after the batch's first live class.`,
    },
    { icon: ClipboardCheck, title: "GARA reviews your work", text: "GARA decides whether to approve it and may decline a commission at its discretion." },
    { icon: Wallet, title: "Paid to your UPI ID", text: "Approved commissions are paid to the UPI ID in your dashboard." },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Campus Ambassador", path: "/campus-ambassador" },
        ])}
      />
      <main className="flex flex-1 flex-col">
        <PageHero
          eyebrow={{ icon: Megaphone, label: "Campus Ambassador" }}
          title={
            <>
              Campus Ambassador <span className="text-primary">Programme</span>
            </>
          }
          actions={
            <>
              <Link href="/candidate/ambassador" className={primaryCta}>
                Apply to become an ambassador
              </Link>
              <Link href="/training" className={secondaryCta}>
                Explore Industrial Training <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          }
        />

        <HighlightsBar
          label="Programme highlights"
          items={[
            { icon: Wallet, value: commission, label: "Per approved paid enrollment", tone: "text-primary" },
            {
              icon: BadgePercent,
              value: `${CAMPUS_AMBASSADOR_POLICY.studentDiscountPercent}% off`,
              label: "For students who use your code",
              tone: "text-violet-600 dark:text-violet-400",
            },
            { icon: Award, value: "Certificate", label: "Verifiable, with a recommendation letter", tone: "text-emerald-600 dark:text-emerald-400" },
            {
              icon: CalendarCheck,
              value: `${CAMPUS_AMBASSADOR_POLICY.trialDays}-day trial`,
              label: "After your approval",
              tone: "text-amber-600 dark:text-amber-400",
            },
          ]}
        />

        <section aria-labelledby="ca-how" className="py-8 lg:py-10">
          <div className={PAGE_GUTTER}>
            <SectionHeading id="ca-how" eyebrow={{ icon: Route, label: "How it works" }} title="Four steps to start" />
            <StepCards
              label="How the Campus Ambassador programme works"
              steps={[
                { icon: UserPlus, title: "Apply", text: "Apply from the Campus Ambassador page in your candidate portal." },
                { icon: BadgeCheck, title: "Get approved", text: `GARA reviews your application; the first ${CAMPUS_AMBASSADOR_POLICY.trialDays} days are a trial.` },
                { icon: QrCode, title: "Share your link", text: "Share your referral link, QR code and the official material at your college." },
                { icon: Wallet, title: "Earn", text: `${commission} for a paid enrollment made with your code, once GARA approves your work.` },
              ]}
            />
          </div>
        </section>

        <section aria-label="Role details" className="border-t border-border/60 bg-muted/20 py-8 dark:bg-muted/5 lg:py-10">
          <div className={`${PAGE_GUTTER} grid grid-cols-1 gap-6 lg:grid-cols-2`}>
            <ListCard
              icon={Megaphone}
              title="What you do"
              tone="primary"
              items={[
                "Share your personal referral link, QR code and the official material with students at your college.",
                "Answer questions honestly and point students to the programme pages for details.",
                "Track clicks, sign-ups and paid enrollments in your ambassador dashboard.",
              ]}
            />
            <ListCard
              icon={Award}
              title="What you get"
              tone="emerald"
              items={[
                `A commission of ${commission} for a paid Industrial Training enrollment made with your code, once GARA reviews and approves your work.`,
                "A verifiable Campus Ambassador certificate and a letter of recommendation.",
                "Top performers may be offered a stipend internship.",
              ]}
            />
          </div>
        </section>

        <section aria-labelledby="ca-paid" className="py-8 lg:py-10">
          <div className={PAGE_GUTTER}>
            <SectionHeading id="ca-paid" eyebrow={{ icon: Wallet, label: "Payouts" }} title="How you are paid" />
            <ol aria-label="How a commission is paid" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {payoutSteps.map((step, index) => (
                <li key={step.title} className="relative flex gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-xs lg:flex-col">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <step.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ul className="mt-4 grid grid-cols-1 gap-3 text-sm text-muted-foreground md:grid-cols-2">
              <li className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-4">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                If the student is refunded, the commission is reversed.
              </li>
              <li className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-4">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Tax is deducted where the law requires it.
              </li>
            </ul>
          </div>
        </section>

        <section aria-label="Roles and rules" className="border-t border-border/60 bg-muted/20 py-8 dark:bg-muted/5 lg:py-10">
          <div className={`${PAGE_GUTTER} grid grid-cols-1 gap-6 lg:grid-cols-5`}>
            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs sm:p-7 lg:col-span-2">
              <h3 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Users className="h-5 w-5" />
                </span>
                Roles
              </h3>
              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                Every college can have several Associates and one Lead, who coordinates them. The first {CAMPUS_AMBASSADOR_POLICY.trialDays} days after
                approval are a trial period.
              </p>
            </div>
            <div className="rounded-2xl border border-rose-500/20 bg-card p-6 shadow-xs sm:p-7 lg:col-span-3">
              <h3 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                Rules
              </h3>
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  'No false promises, such as a "placement guarantee".',
                  "Never collect money from anyone: students pay only on this website.",
                  "Use only official material; you cannot use your own code for yourself.",
                  "Breaking the rules can end the role.",
                ].map((rule) => (
                  <li key={rule} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="ca-apply" className="py-8 lg:py-10">
          <div className={PAGE_GUTTER}>
            <div className="flex flex-col items-start gap-6 rounded-3xl border border-primary/20 bg-primary/5 p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <h2 id="ca-apply" className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Before you apply
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Read the{" "}
                  <Link href="/terms" className={linkClass}>
                    Terms of Service
                  </Link>{" "}
                  and the{" "}
                  <Link href="/privacy" className={linkClass}>
                    Privacy Policy
                  </Link>
                  . Internships at {ORGANIZATION_NAME} are always free and separate from this programme; see{" "}
                  <Link href="/training" className={linkClass}>
                    Industrial Training
                  </Link>{" "}
                  for the programmes you will share.
                </p>
              </div>
              <Link href="/candidate/ambassador" className={primaryCta}>
                Apply now <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
