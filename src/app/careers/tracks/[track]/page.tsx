import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { ArrowLeft, Briefcase } from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { JsonLd } from "@/components/seo/json-ld";
import { Eyebrow } from "@/components/marketing/page-sections";
import { getActiveTrackBySlug } from "@/features/openings/services/track-service";
import { getPublicOpenings } from "@/features/openings/services/opening-service";
import { isApplicationWindowClosed } from "@/features/openings/listing";
import { buildBreadcrumbJsonLd, ORGANIZATION_NAME } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { OpeningsListing } from "../../_components/openings-listing";

export const instant = false;

type TrackParams = Promise<{ track: string }>;
type TrackSearchParams = Promise<Record<string, string | string[] | undefined>>;

function trackDescription(track: { name: string; description: string | null }): string {
  return track.description ?? `Open ${track.name} internships and full-time roles at ${ORGANIZATION_NAME}. Apply online.`;
}

/** Track pages are indexable while they list at least one open opening (no empty pages in search). */
export async function generateMetadata({ params }: { params: TrackParams }): Promise<Metadata> {
  const { track: slug } = await params;
  const track = await getActiveTrackBySlug(slug).catch(() => null);
  if (!track) {
    return { title: "Track Not Found", robots: { index: false, follow: false } };
  }

  const openings = await getPublicOpenings({ trackSlug: slug }).catch(() => []);
  await connection();
  const now = new Date();
  const hasOpenOpenings = openings.some((opening) => !isApplicationWindowClosed(opening.applyDeadline, now));

  const url = absoluteUrl(`/careers/tracks/${track.slug}`);
  const title = `${track.name} Internships & Jobs`;
  const description = trackDescription(track);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: ORGANIZATION_NAME, title: `${title} at ${ORGANIZATION_NAME}`, description },
    ...(hasOpenOpenings ? {} : { robots: { index: false, follow: true } }),
  };
}

async function TrackHeader({ params }: { params: TrackParams }) {
  const { track: slug } = await params;
  let track: Awaited<ReturnType<typeof getActiveTrackBySlug>>;
  try {
    track = await getActiveTrackBySlug(slug);
  } catch {
    // Database unavailable: keep the page; the listing below explains that openings did not load.
    return (
      <div className="text-center mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
          Career Track
        </h1>
      </div>
    );
  }
  if (!track) notFound();

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Careers", path: "/careers" },
          { name: track.name, path: `/careers/tracks/${track.slug}` },
        ])}
      />
      <div className="text-center mb-6 space-y-3">
        <Eyebrow icon={Briefcase}>Career track</Eyebrow>
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
          {track.name} Internships & Jobs
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">{trackDescription(track)}</p>
      </div>
    </>
  );
}

export default async function TrackPage({ params, searchParams }: { params: TrackParams; searchParams: TrackSearchParams }) {
  const { track: slug } = await params;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-8 md:py-10">
        <div className={PAGE_GUTTER}>
          <Link
            href="/careers"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All openings
          </Link>
          <TrackHeader params={params} />
          <OpeningsListing searchParams={searchParams} trackSlug={slug} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
