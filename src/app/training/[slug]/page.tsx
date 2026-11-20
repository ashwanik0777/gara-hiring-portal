import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { ArrowLeft, BookOpen, CheckCircle, Clock, ListChecks, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd, ORGANIZATION_NAME } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { TRAINING_PASS_CRITERIA, TRAINING_POLICY } from "@/config/site";
import {
  getPublishedProgramBySlug,
  isBatchOpenForEnrollment,
  seatsTakenByBatch,
  type PublicTrainingProgram,
} from "@/features/training/services/program-service";
import { buildCourseJsonLd } from "@/features/training/seo";
import { formatInr } from "@/features/training/money";
import { formatBatchDay, formatBatchDayTime } from "@/features/training/components/batch-dates";

export const instant = false;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const program = await getPublishedProgramBySlug(slug).catch(() => null);
  if (!program) return { title: "Programme Not Found", robots: { index: false, follow: false } };
  const url = absoluteUrl(`/training/${program.slug}`);
  return {
    title: `${program.title} — Industrial Training`,
    description: program.summary,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: ORGANIZATION_NAME, title: `${program.title} — Industrial Training`, description: program.summary },
  };
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

async function Batches({ program }: { program: PublicTrainingProgram }) {
  await connection();
  const now = new Date();
  const taken = await seatsTakenByBatch(program.batches.map((batch) => batch.id), now).catch(() => new Map<string, number>());

  if (program.batches.length === 0) {
    return <p className="text-sm text-muted-foreground">The next batch will be announced here.</p>;
  }
  return (
    <ul className="space-y-3">
      {program.batches.map((batch) => {
        const seatsLeft = Math.max(0, batch.seats - (taken.get(batch.id) ?? 0));
        const open = isBatchOpenForEnrollment(batch, now) && seatsLeft > 0;
        return (
          <li key={batch.id} className="rounded-md border border-border/70 p-4 space-y-2">
            <p className="font-semibold text-foreground">{batch.name}</p>
            <dl className="text-xs text-muted-foreground space-y-1">
              <div>
                <dt className="inline">Starts: </dt>
                <dd className="inline text-foreground">{formatBatchDay(batch.startDate)}</dd>
              </div>
              {batch.firstClassAt && (
                <div>
                  <dt className="inline">First live class: </dt>
                  <dd className="inline text-foreground">{formatBatchDayTime(batch.firstClassAt)}</dd>
                </div>
              )}
              {batch.scheduleText && (
                <div>
                  <dt className="inline">Schedule: </dt>
                  <dd className="inline text-foreground">{batch.scheduleText}</dd>
                </div>
              )}
              <div>
                <dt className="inline">Seats: </dt>
                <dd className="inline text-foreground">{seatsLeft > 0 ? `${seatsLeft} of ${batch.seats} left` : "Full"}</dd>
              </div>
            </dl>
            {open ? (
              <Link href={`/training/${program.slug}/enroll?batch=${batch.id}`} className="block">
                <Button className="w-full">Enrol in this batch</Button>
              </Link>
            ) : (
              <p className="text-xs font-medium text-muted-foreground">{seatsLeft === 0 ? "This batch is full." : "Enrollment is closed for this batch."}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function TrainingProgramPage({ params }: { params: Params }) {
  const { slug } = await params;
  const program = await getPublishedProgramBySlug(slug);
  if (!program) notFound();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1 py-10 md:py-14">
        <div className={PAGE_GUTTER}>
          <JsonLd data={buildCourseJsonLd(program)} />
          <JsonLd
            data={buildBreadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Industrial Training", path: "/training" },
              { name: program.title, path: `/training/${program.slug}` },
            ])}
          />
          <Link href="/training" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-3.5 w-3.5" /> All programmes
          </Link>

          <header className="border-b border-border/70 pb-8 mb-8 space-y-3">
            {program.track && <span className="text-xs font-medium text-primary">{program.track.name}</span>}
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{program.title}</h1>
            <p className="text-base text-muted-foreground">{program.summary}</p>
            <p className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-2xl font-bold text-foreground">{formatInr(program.feePaise)}</span>
              <span className="text-muted-foreground">Includes the digital certificate</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" aria-hidden="true" /> {program.durationWeeks} weeks
              </span>
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
            <div className="lg:col-span-8 space-y-10">
              <Section title="About the programme" icon={<BookOpen className="h-5 w-5 text-primary" />}>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{program.description}</p>
              </Section>

              {program.syllabus.length > 0 && (
                <Section title="Weekly syllabus" icon={<ListChecks className="h-5 w-5 text-primary" />}>
                  <ol className="space-y-3">
                    {program.syllabus.map((week) => (
                      <li key={week.week} className="rounded-md border border-border/70 p-4">
                        <p className="font-semibold text-foreground">
                          Week {week.week}: {week.title}
                        </p>
                        {week.topics.length > 0 && (
                          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                            {week.topics.map((topic) => (
                              <li key={topic}>{topic}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {program.prerequisites && (
                <Section title="Before you join" icon={<CheckCircle className="h-5 w-5 text-primary" />}>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{program.prerequisites}</p>
                </Section>
              )}
              {program.outcomes && (
                <Section title="What you will be able to do" icon={<CheckCircle className="h-5 w-5 text-primary" />}>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{program.outcomes}</p>
                </Section>
              )}

              <Section title="Pass criteria and certificate" icon={<ShieldCheck className="h-5 w-5 text-primary" />}>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  <li>At least {TRAINING_PASS_CRITERIA.minMarksPercent}% marks across the assignments.</li>
                  <li>At least {TRAINING_PASS_CRITERIA.minAttendancePercent}% attendance in live classes.</li>
                  {TRAINING_PASS_CRITERIA.finalProjectRequired && <li>A final project, submitted and passed.</li>}
                  {TRAINING_PASS_CRITERIA.liveDemoRequired && <li>A live demo, passed.</li>}
                  <li>Pass and you get a verifiable digital certificate; if not, you can re-attempt in a later batch free of charge, once.</li>
                </ul>
              </Section>

              <Section title="Refunds" icon={<ShieldCheck className="h-5 w-5 text-primary" />}>
                <p className="text-sm text-muted-foreground">
                  If you ask before the batch starts or within {TRAINING_POLICY.refundHoursAfterFirstClass} hours after the first
                  live class, you get back the fee you paid minus the payment gateway charges (Razorpay&apos;s fee and the GST
                  on it). After that there is no refund, but you can move to the next batch free of charge, once.{" "}
                  <Link href="/refund-policy" className="font-medium text-primary hover:underline underline-offset-4">
                    Read the Refund &amp; Cancellation Policy
                  </Link>
                  .
                </p>
              </Section>
            </div>

            <aside className="lg:col-span-4">
              <Card className="lg:sticky lg:top-24">
                <CardContent className="p-6 space-y-4">
                  <h2 className="text-base font-bold tracking-tight">Batches</h2>
                  <Batches program={program} />
                  <p className="text-xs text-muted-foreground">You need an account with a verified email to enrol.</p>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
