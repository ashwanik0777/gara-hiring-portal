import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, Clock, GraduationCap } from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd, ORGANIZATION_NAME } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
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
    return (
      <EmptyState
        title="No programmes open right now"
        description="New Industrial Training batches are announced here. Please check back soon."
        icon={<GraduationCap className="h-6 w-6 text-primary" />}
      />
    );
  }

  const now = new Date();
  const taken = await seatsTakenByBatch(programs.flatMap((program) => program.batches.map((batch) => batch.id)), now).catch(
    () => new Map<string, number>()
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {programs.map((program) => {
        const next = nextOpenBatch(program, taken, now);
        return (
          <Card key={program.id} className="flex flex-col justify-between rounded-3xl border-border/80 hover:border-primary/50 hover:shadow-lg transition-all">
            <CardHeader className="pb-3">
              {program.track && <span className="text-xs font-medium text-primary">{program.track.name}</span>}
              <CardTitle className="font-[family-name:var(--font-display)] text-xl font-bold">{program.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground line-clamp-3">{program.summary}</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {program.durationWeeks} weeks
                </li>
                <li className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {next
                    ? `Next batch ${formatBatchDay(next.batch.startDate)} · ${next.seatsLeft > 0 ? `${next.seatsLeft} seats left` : "full"}`
                    : "Next batch to be announced"}
                </li>
              </ul>
              <p className="text-lg font-bold text-foreground">
                {formatInr(program.feePaise)} <span className="text-xs font-normal text-muted-foreground">includes the digital certificate</span>
              </p>
            </CardContent>
            <CardFooter className="border-t border-border/50 pt-3">
              <Link href={`/training/${program.slug}`} className="w-full">
                <Button variant="outline" size="sm" className="w-full justify-between">
                  View programme <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

export default function TrainingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1 py-12 md:py-16">
        <div className={PAGE_GUTTER}>
          <JsonLd
            data={buildBreadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Industrial Training", path: "/training" },
            ])}
          />
          <div className="text-center mb-10 space-y-3">
            <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
              Industrial Training Programmes
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Paid, mentor-led batches with assignments, a final project and a live demo. The digital certificate is included in
              the fee. Internships at GARA are separate and always free.
            </p>
          </div>
          <ProgramList />
        </div>
      </main>
      <Footer />
    </div>
  );
}
