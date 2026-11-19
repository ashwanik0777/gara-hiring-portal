import Link from "next/link";
import { headers } from "next/headers";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { LinkPendingReporter } from "@/components/navigation/navigation-progress";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { getPublicOpenings } from "@/features/openings/services/opening-service";
import { Briefcase, Building, ArrowRight } from "lucide-react";
import { getSiteUrl } from "@/lib/site-url";
import {
  externalReferrerHost,
  pickAttributionParams,
  toAttributionQuery,
} from "@/features/applications/source-tracking";
import { buildCareersIndexMetadata } from "./_lib/seo";

export const metadata = buildCareersIndexMetadata();

type CareersSearchParams = Promise<Record<string, string | string[] | undefined>>;

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

async function OpeningsList({ searchParams }: { searchParams: CareersSearchParams }) {
  // Campaign parameters (and an external referrer host) are carried to the opening pages.
  // They are request data, so the page renders per request; the list below comes from the
  // shared public-openings cache (not a database query per visit).
  const attribution = pickAttributionParams(await searchParams);
  if (!attribution.ref) {
    const referrerHost = externalReferrerHost((await headers()).get("referer"), getSiteUrl());
    if (referrerHost) attribution.ref = referrerHost;
  }
  const attributionQuery = toAttributionQuery(attribution);

  let openings: Awaited<ReturnType<typeof getPublicOpenings>>;
  try {
    openings = await getPublicOpenings();
  } catch {
    // Keep the page (heading, navigation, footer) and explain, instead of the error screen.
    return (
      <p role="status" className="mx-auto max-w-xl rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
        Openings could not be loaded right now. Please refresh the page in a moment.
      </p>
    );
  }

  if (openings.length === 0) {
    return (
      <EmptyState
        title="No open positions currently available"
        description="We do not have active public vacancies at this moment. New cohorts are published regularly, please check back soon."
        icon={<Briefcase className="h-6 w-6 text-primary" />}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {openings.map((opening) => (
        <Card
          key={opening.id}
          className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <Badge variant={opening.type === "INTERNSHIP" ? "default" : "secondary"}>
                {opening.type === "INTERNSHIP" ? "Internship Cohort" : "Full-Time Position"}
              </Badge>
              <span className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                <Building className="h-3 w-3" />
                {opening.workplaceType.toLowerCase()}
              </span>
            </div>
            <CardTitle className="font-[family-name:var(--font-display)] text-xl font-bold line-clamp-1">
              {opening.title}
            </CardTitle>
          </CardHeader>

          <CardContent className="pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              {opening.description}
            </p>
          </CardContent>

          <CardFooter className="pt-3 border-t border-border/50">
            <Link href={`/careers/${opening.slug}${attributionQuery}`} className="w-full">
              <Button variant="outline" size="sm" className="w-full justify-between gap-2">
                <span>View Role & Requirements</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <LinkPendingReporter />
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export default function CareersPage({ searchParams }: { searchParams: CareersSearchParams }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page Header (part of the static shell) */}
          <div className="text-center max-w-6xl mx-auto mb-12 space-y-3">
            <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
              Current Openings & Internship Cohorts
            </h1>
          </div>

          {/* Rendered into the first HTML response (no JavaScript needed), so link previews,
              crawlers and slow phones see the openings; the list itself comes from the cache. */}
          <OpeningsList searchParams={searchParams} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
