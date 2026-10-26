import { Suspense } from "react";
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
import { CardGridSkeleton } from "@/components/feedback/page-skeletons";
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
  // They are request data, read before the openings so this component always streams at
  // request time: the list below comes from the shared public-openings cache (not a
  // database query per visit) and is never evaluated during the build-time prerender.
  const attribution = pickAttributionParams(await searchParams);
  if (!attribution.ref) {
    const referrerHost = externalReferrerHost((await headers()).get("referer"), getSiteUrl());
    if (referrerHost) attribution.ref = referrerHost;
  }
  const attributionQuery = toAttributionQuery(attribution);

  const openings = await getPublicOpenings();

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

          {/* Openings grid streamed inside Suspense (cached data, request-time attribution) */}
          <Suspense fallback={<CardGridSkeleton />}>
            <OpeningsList searchParams={searchParams} />
          </Suspense>
        </div>
      </main>

      <Footer />
    </div>
  );
}
