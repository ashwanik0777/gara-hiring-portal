import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { LinkPendingReporter } from "@/components/navigation/navigation-progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import {
  getPublicOpeningBySlug,
  type PublicOpening,
} from "@/features/openings/services/opening-service";
import { NotFoundError } from "@/lib/errors";
import {
  OPENING_TYPE_LABELS,
  WORKPLACE_LABELS,
  formatDeadline,
  isApplicationWindowClosed,
} from "@/features/openings/listing";
import { getSiteUrl } from "@/lib/site-url";
import {
  externalReferrerHost,
  pickAttributionParams,
  toAttributionQuery,
} from "@/features/applications/source-tracking";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd } from "@/lib/seo/json-ld";
import { buildJobPostingJsonLd, buildOpeningMetadata } from "../_lib/seo";
import {
  Briefcase,
  MapPin,
  Building,
  ArrowLeft,
  CalendarCheck,
  CheckCircle,
  FileText,
  GraduationCap,
  Sparkles,
} from "lucide-react";

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

type OpeningParams = Promise<{ slug: string }>;
type OpeningSearchParams = Promise<Record<string, string | string[] | undefined>>;

interface OpeningDetailPageProps {
  params: OpeningParams;
  searchParams: OpeningSearchParams;
}

export async function generateMetadata({ params }: OpeningDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    // Only PUBLISHED openings resolve (from the public-openings cache); anything else is
    // reported as not found.
    const opening = await getPublicOpeningBySlug(slug);
    return buildOpeningMetadata(opening);
  } catch {
    return {
      title: "Opening Not Found",
      robots: { index: false, follow: false },
    };
  }
}

/**
 * The apply link carries the campaign parameters (and an external referrer host) so the
 * application records where the candidate came from. Search params and headers are request
 * data, so each link streams behind its own Suspense boundary while the cached opening
 * content above it renders without waiting for them.
 */
async function ApplyLink({
  slug,
  searchParams,
  size,
  fullWidth = false,
  children,
}: {
  slug: string;
  searchParams: OpeningSearchParams;
  size?: "lg";
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  const attribution = pickAttributionParams(await searchParams);
  if (!attribution.ref) {
    const referrerHost = externalReferrerHost((await headers()).get("referer"), getSiteUrl());
    if (referrerHost) attribution.ref = referrerHost;
  }
  const applyHref = `/careers/${slug}/apply${toAttributionQuery(attribution)}`;
  const buttonClassName = [size === "lg" ? "gap-2" : null, fullWidth ? "w-full" : null].filter(Boolean).join(" ");

  return (
    <Link href={applyHref} className={fullWidth ? "block" : undefined}>
      <Button size={size} className={buttonClassName}>
        {children}
      </Button>
      <LinkPendingReporter />
    </Link>
  );
}

function ClosedNotice({ deadline }: { deadline: Date }) {
  return (
    <p role="status" className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground">
      Applications for this opening closed on {formatDeadline(deadline)}.
    </p>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}

function OpeningContent({
  opening,
  searchParams,
  isClosed,
}: {
  opening: PublicOpening;
  searchParams: OpeningSearchParams;
  /** The application deadline has passed (decided at request time). */
  isClosed: boolean;
}) {
  return (
    <>
      {/* Google Jobs structured data (only while applications are open, as Google requires)
          and the breadcrumb trail shown in search results. */}
      {!isClosed && (
        <JsonLd
          data={buildJobPostingJsonLd({
            ...opening,
            closesAt: opening.applyDeadline,
          })}
        />
      )}
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Careers", path: "/careers" },
          ...(opening.track ? [{ name: opening.track.name, path: `/careers/tracks/${opening.track.slug}` }] : []),
          { name: opening.title, path: `/careers/${opening.slug}` },
        ])}
      />

      {/* Opening Header */}
      <div className="border-b border-border/70 pb-8 mb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={opening.type === "INTERNSHIP" ? "default" : "secondary"}>
            {opening.type === "INTERNSHIP" ? "Internship Cohort" : "Full-Time Position"}
          </Badge>
          <Badge variant="outline">{WORKPLACE_LABELS[opening.workplaceType]}</Badge>
          {opening.track && (
            <Link
              href={`/careers/tracks/${opening.track.slug}`}
              className="text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              {opening.track.name}
            </Link>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Building className="h-3.5 w-3.5" />
            {opening.department}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {opening.location}
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          {opening.title}
        </h1>

        {opening.summary && (
          <p className="text-base text-muted-foreground leading-relaxed">{opening.summary}</p>
        )}

        {isClosed && opening.applyDeadline ? (
          <ClosedNotice deadline={opening.applyDeadline} />
        ) : (
          <div className="flex flex-wrap items-center gap-4 pt-2">
            {/* Fallback: the same link without campaign parameters, so it works without JavaScript. */}
            <Suspense
              fallback={
                <Link href={`/careers/${opening.slug}/apply`}>
                  <Button size="lg" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Apply for this Role
                  </Button>
                </Link>
              }
            >
              <ApplyLink slug={opening.slug} searchParams={searchParams} size="lg">
                <FileText className="h-4 w-4" />
                Apply for this Role
              </ApplyLink>
            </Suspense>
            {opening.applyDeadline && (
              <span className="text-sm font-medium text-foreground">Apply by {formatDeadline(opening.applyDeadline)}</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
        {/* Role Content Details */}
        <div className="lg:col-span-8 space-y-10">
          {/* Description */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              About the Role
            </h2>
            <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line bg-card/40 p-6 rounded-xl border border-border/60">
              {opening.description}
            </div>
          </section>

          {/* Responsibilities */}
          {opening.responsibilities && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Key Responsibilities
              </h2>
              <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line bg-card/40 p-6 rounded-xl border border-border/60">
                {opening.responsibilities}
              </div>
            </section>
          )}

          {/* Requirements */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Requirements & Qualifications
            </h2>
            <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line bg-card/40 p-6 rounded-xl border border-border/60">
              {opening.requirements}
            </div>
          </section>

          {/* Skills */}
          {opening.skills.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Skills
              </h2>
              <ul className="flex flex-wrap gap-2">
                {opening.skills.map((skill) => (
                  <li key={skill} className="rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-foreground">
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Eligibility */}
          {opening.eligibility && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                Who Can Apply
              </h2>
              <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line bg-card/40 p-6 rounded-xl border border-border/60">
                {opening.eligibility}
              </div>
            </section>
          )}

          {/* Internship Lifecycle Info Callout */}
          {opening.type === "INTERNSHIP" && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                  <CalendarCheck className="h-4 w-4" />
                  Seven-Working-Day Supervised Evaluation
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Selected candidates for this internship complete a 7-working-day supervised
                  evaluation. Work progress is tracked against structured milestones and reviewed
                  by the hiring team.
                </p>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Role summary and apply action (beside the details on large screens, after them on phones) */}
        <aside className="lg:col-span-4">
          <Card className="lg:sticky lg:top-24">
            <CardContent className="p-6 space-y-5">
              <h2 className="text-base font-bold tracking-tight text-foreground">Role summary</h2>
              <dl className="grid grid-cols-2 lg:grid-cols-1 gap-4 text-sm">
                <SummaryRow label="Type">{OPENING_TYPE_LABELS[opening.type]}</SummaryRow>
                {opening.track && <SummaryRow label="Track">{opening.track.name}</SummaryRow>}
                <SummaryRow label="Department">{opening.department}</SummaryRow>
                <SummaryRow label="Location">{opening.location}</SummaryRow>
                <SummaryRow label="Work mode">{WORKPLACE_LABELS[opening.workplaceType]}</SummaryRow>
                {opening.durationText && <SummaryRow label="Duration">{opening.durationText}</SummaryRow>}
                {opening.stipendPolicyText && <SummaryRow label="Stipend">{opening.stipendPolicyText}</SummaryRow>}
                {opening.openingsCount && <SummaryRow label="Positions">{opening.openingsCount}</SummaryRow>}
                {opening.applyDeadline && (
                  <SummaryRow label="Last date to apply">{formatDeadline(opening.applyDeadline)}</SummaryRow>
                )}
              </dl>
              <div className="space-y-3 border-t border-border/60 pt-5">
                {isClosed ? (
                  <p className="text-sm font-medium text-foreground">Applications for this opening are closed.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Sign in or create a candidate account to apply.</p>
                    <Suspense
                      fallback={
                        <Link href={`/careers/${opening.slug}/apply`} className="block">
                          <Button className="w-full">Apply Now</Button>
                        </Link>
                      }
                    >
                      <ApplyLink slug={opening.slug} searchParams={searchParams} fullWidth>
                        Apply Now
                      </ApplyLink>
                    </Suspense>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

/** Resolves the slug and streams the cached opening; unknown or unpublished slugs are 404s. */
async function OpeningDetail({ params, searchParams }: OpeningDetailPageProps) {
  const { slug } = await params;

  let opening: PublicOpening;
  try {
    opening = await getPublicOpeningBySlug(slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  // Compared at request time: the cached opening cannot know when its deadline passes.
  await connection();
  const isClosed = isApplicationWindowClosed(opening.applyDeadline, new Date());

  return <OpeningContent opening={opening} searchParams={searchParams} isClosed={isClosed} />;
}

export default function OpeningDetailPage({ params, searchParams }: OpeningDetailPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-10 md:py-14">
        <div className={PAGE_GUTTER}>
          {/* Back Navigation */}
          <Link
            href="/careers"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to All Opportunities
            <LinkPendingReporter />
          </Link>

          {/* Rendered into the first HTML response (no JavaScript needed): link previews,
              crawlers and slow phones see the full opening; the data comes from the cache. */}
          <OpeningDetail params={params} searchParams={searchParams} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
