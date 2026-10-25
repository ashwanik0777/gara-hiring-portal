import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicOpeningBySlug } from "@/features/openings/services/opening-service";
import { NotFoundError } from "@/lib/errors";
import { getSiteUrl } from "@/lib/site-url";
import {
  externalReferrerHost,
  pickAttributionParams,
  toAttributionQuery,
} from "@/features/applications/source-tracking";
import { buildJobPostingJsonLd, buildOpeningMetadata, serializeJsonLd } from "../_lib/seo";
import {
  Briefcase,
  MapPin,
  Building,
  ArrowLeft,
  CalendarCheck,
  CheckCircle,
  FileText,
} from "lucide-react";

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

interface OpeningDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: OpeningDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    // Only PUBLISHED openings resolve; anything else is reported as not found.
    const opening = await getPublicOpeningBySlug(slug);
    return buildOpeningMetadata(opening);
  } catch {
    return {
      title: "Opening Not Found",
      robots: { index: false, follow: false },
    };
  }
}

export default async function OpeningDetailPage({ params, searchParams }: OpeningDetailPageProps) {
  const { slug } = await params;

  let opening: Awaited<ReturnType<typeof getPublicOpeningBySlug>>;
  try {
    opening = await getPublicOpeningBySlug(slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  // Campaign parameters (and an external referrer host) travel with the apply link so the
  // application records where the candidate came from.
  const attribution = pickAttributionParams(await searchParams);
  if (!attribution.ref) {
    const referrerHost = externalReferrerHost((await headers()).get("referer"), getSiteUrl());
    if (referrerHost) attribution.ref = referrerHost;
  }
  const applyHref = `/careers/${opening.slug}/apply${toAttributionQuery(attribution)}`;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Google Jobs structured data; serializeJsonLd escapes <, > and & as unicode. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildJobPostingJsonLd(opening)) }}
      />
      <Navbar />

      <main className="flex-1 py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Navigation */}
          <Link
            href="/careers"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to All Opportunities
          </Link>

          {/* Opening Header */}
          <div className="border-b border-border/70 pb-8 mb-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={opening.type === "INTERNSHIP" ? "default" : "secondary"}>
                {opening.type === "INTERNSHIP" ? "Internship Cohort" : "Full-Time Position"}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {opening.workplaceType.toLowerCase()}
              </Badge>
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

            <div className="flex items-center gap-4 pt-2">
              <Link href={applyHref}>
                <Button size="lg" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Apply for this Role
                </Button>
              </Link>
            </div>
          </div>

          {/* Role Content Details */}
          <div className="space-y-10">
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

            {/* Final Apply Bar */}
            <div className="pt-6 border-t border-border/60 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Interested in this role?</p>
                <p className="text-xs text-muted-foreground">Sign in or create a candidate account to apply.</p>
              </div>
              <Link href={applyHref}>
                <Button>Apply Now</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
