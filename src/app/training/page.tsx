import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  Clock,
  CreditCard,
  GraduationCap,
  Layers,
  MonitorPlay,
  RotateCcw,
  Route,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { EmptyState } from "@/components/feedback/empty-state";
import { CardGridSkeleton } from "@/components/feedback/page-skeletons";
import { JsonLd } from "@/components/seo/json-ld";
import { HighlightsBar, PageHero, SectionHeading, StepCards, primaryCta, secondaryCta } from "@/components/marketing/page-sections";
import { buildBreadcrumbJsonLd, ORGANIZATION_NAME } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { TRAINING_PASS_CRITERIA, TRAINING_POLICY } from "@/config/site";
import {
  isBatchOpenForEnrollment,
  listPublishedPrograms,
  seatsTakenByBatch,
  type PublicTrainingProgram,
} from "@/features/training/services/program-service";
import { formatInr } from "@/features/training/money";
import { formatBatchDay } from "@/features/training/components/batch-dates";

export const instant = false;

const DESCRIPTION = `Paid Industrial Training programmes by ${ORGANIZATION_NAME}: live mentor-led batches, assignments, a final project and a verifiable digital certificate included in the fee.`;

export const metadata: Metadata = {
  title: "Industrial Training Programmes",
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/training") },
  openGraph: { type: "website", url: absoluteUrl("/training"), siteName: ORGANIZATION_NAME, title: `Industrial Training at ${ORGANIZATION_NAME}`, description: DESCRIPTION },
};

/** The next batch students can still join, with its free seats (computed at request time). */
function nextOpenBatch(program: PublicTrainingProgram, taken: Map<string, number>, now: Date) {
  for (const batch of program.batches) {
    if (!isBatchOpenForEnrollment(batch, now)) continue;
    return { batch, seatsLeft: Math.max(0, batch.seats - (taken.get(batch.id) ?? 0)) };
  }
  return null;
}

function ProgramCard({ program, next }: { program: PublicTrainingProgram; next: ReturnType<typeof nextOpenBatch> }) {
  const filled = next ? Math.min(100, Math.round(((next.batch.seats - next.seatsLeft) / Math.max(1, next.batch.seats)) * 100)) : 0;
  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-border/80 bg-card shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {program.track && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{program.track.name}</span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {program.durationWeeks} weeks
          </span>
        </div>
        <div className="space-y-2">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-bold leading-snug text-foreground">{program.title}</h3>
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{program.summary}</p>
        </div>
        <div className="mt-auto space-y-2.5 rounded-2xl border border-border/60 bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            {next ? (
              <>
                Next batch <span className="font-semibold">{formatBatchDay(next.batch.startDate)}</span>
              </>
            ) : (
              "Next batch to be announced"
            )}
          </p>
          {next && (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15" aria-hidden="true">
                <div className={cn("h-full rounded-full", next.seatsLeft > 0 ? "bg-primary" : "bg-destructive")} style={{ width: `${filled}%` }} />
              </div>
              <p className={cn("flex items-center gap-1.5 text-xs font-medium", next.seatsLeft > 0 ? "text-muted-foreground" : "text-destructive")}>
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {next.seatsLeft > 0 ? `${next.seatsLeft} seats left` : "Batch full"}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">{formatInr(program.feePaise)}</p>
          <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <Award className="h-3 w-3" aria-hidden="true" /> Certificate included
          </p>
        </div>
        <Link
          href={`/training/${program.slug}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View programme <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          <span className="sr-only">: {program.title}</span>
        </Link>
      </div>
    </div>
  );
}

async function ProgramList() {
  // Seats change with every enrollment, so the list is rendered per request (never at build).
  await connection();
  let programs: PublicTrainingProgram[];
  try {
    programs = await listPublishedPrograms();
  } catch {
    return (
      <p role="status" className="mx-auto max-w-xl rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
        Programmes could not be loaded right now. Please refresh the page in a moment.
      </p>
    );
  }
  if (programs.length === 0) {
    return <EmptyState title="No programmes open right now" icon={<GraduationCap className="h-6 w-6 text-primary" />} />;
  }

  const now = new Date();
  const taken = await seatsTakenByBatch(programs.flatMap((program) => program.batches.map((batch) => batch.id)), now).catch(
    () => new Map<string, number>()
  );

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {programs.map((program) => (
        <ProgramCard key={program.id} program={program} next={nextOpenBatch(program, taken, now)} />
      ))}
    </div>
  );
}

export default function TrainingPage() {
  const passLine = [
    `${TRAINING_PASS_CRITERIA.minMarksPercent}% assignment marks`,
    `${TRAINING_PASS_CRITERIA.minAttendancePercent}% attendance`,
    TRAINING_PASS_CRITERIA.finalProjectRequired ? "a passed final project" : null,
    TRAINING_PASS_CRITERIA.liveDemoRequired ? "a live demo" : null,
  ].filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Industrial Training", path: "/training" },
        ])}
      />
      <main className="flex flex-1 flex-col">
        <PageHero
          eyebrow={{ icon: GraduationCap, label: "Industrial Training" }}
          title={
            <>
              Industrial Training <span className="text-primary">Programmes</span>
            </>
          }
          actions={
            <>
              <a href="#programmes" className={primaryCta}>
                Browse programmes <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href="#how-it-works" className={secondaryCta}>
                How it works
              </a>
            </>
          }
        />

        <HighlightsBar
          label="Programme highlights"
          items={[
            { icon: MonitorPlay, value: "Live classes", label: "Mentor-led batches", tone: "text-primary" },
            { icon: Layers, value: "Real projects", label: "Assignments and a final project", tone: "text-violet-600 dark:text-violet-400" },
            { icon: Award, value: "Certificate", label: "Verifiable, included in the fee", tone: "text-emerald-600 dark:text-emerald-400" },
            {
              icon: RotateCcw,
              value: `${TRAINING_POLICY.refundHoursAfterFirstClass}-hour refund`,
              label: "Window after the first live class",
              tone: "text-amber-600 dark:text-amber-400",
            },
          ]}
        />

        <section id="programmes" aria-labelledby="programmes-heading" className="scroll-mt-24 py-8 lg:py-10">
          <div className={PAGE_GUTTER}>
            <SectionHeading id="programmes-heading" eyebrow={{ icon: BookOpen, label: "Programmes" }} title="Choose your programme" />
            <Suspense fallback={<CardGridSkeleton count={3} />}>
              <ProgramList />
            </Suspense>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24 border-t border-border/60 bg-muted/20 py-8 dark:bg-muted/5 lg:py-10">
          <div className={PAGE_GUTTER}>
            <SectionHeading id="how-heading" eyebrow={{ icon: Route, label: "How it works" }} title="From enrolment to certificate" />
            <StepCards
              label="How Industrial Training works"
              steps={[
                { icon: CalendarDays, title: "Choose a batch", text: "Pick a programme and a batch with free seats." },
                { icon: CreditCard, title: "Pay securely", text: "Sign in with a verified email and pay through Razorpay." },
                { icon: MonitorPlay, title: "Learn live", text: "Attend live classes, submit assignments and build your final project." },
                { icon: Award, title: "Get certified", text: `Pass with ${passLine.join(", ")}.` },
              ]}
            />
            <p className="mt-5 text-center text-sm text-muted-foreground">
              Read the{" "}
              <Link href="/refund-policy" className="font-medium text-primary underline-offset-4 hover:underline">
                Refund &amp; Cancellation Policy
              </Link>{" "}
              before you enrol.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
