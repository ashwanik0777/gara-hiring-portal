import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { buildCareersIndexMetadata } from "./_lib/seo";
import { OpeningsListing } from "./_components/openings-listing";

// Filtered views (?type=, ?mode=) share the canonical /careers URL set here.
export const metadata = buildCareersIndexMetadata();

type CareersSearchParams = Promise<Record<string, string | string[] | undefined>>;

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

export default function CareersPage({ searchParams }: { searchParams: CareersSearchParams }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-12 md:py-16">
        <div className={PAGE_GUTTER}>
          {/* Page Header (part of the static shell) */}
          <div className="text-center mb-10 space-y-3">
            <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
              Current Openings & Internship Cohorts
            </h1>
          </div>

          {/* Rendered into the first HTML response (no JavaScript needed), so link previews,
              crawlers and slow phones see the openings; the list itself comes from the cache. */}
          <OpeningsListing searchParams={searchParams} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
