import { Briefcase, CalendarCheck, FileCheck, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { HighlightsBar, PageHero } from "@/components/marketing/page-sections";
import { buildCareersIndexMetadata } from "./_lib/seo";
import { OpeningsListing } from "./_components/openings-listing";

// Filtered views (?type=, ?mode=) share the canonical /careers URL set here.
export const metadata = buildCareersIndexMetadata();

type CareersSearchParams = Promise<Record<string, string | string[] | undefined>>;

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

export default function CareersPage({ searchParams }: { searchParams: CareersSearchParams }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex flex-1 flex-col">
        {/* Hero and highlights are part of the static shell. */}
        <PageHero eyebrow={{ icon: Briefcase, label: "Careers" }} title="Current Openings & Internship Cohorts" />

        <HighlightsBar
          label="Why apply"
          items={[
            { icon: Briefcase, value: "Internships & Jobs", label: "Apply online", tone: "text-primary" },
            { icon: ShieldCheck, value: "No Fee", label: "Internships are always free", tone: "text-emerald-600 dark:text-emerald-400" },
            { icon: CalendarCheck, value: "7-Day", label: "Supervised evaluation", tone: "text-violet-600 dark:text-violet-400" },
            { icon: FileCheck, value: "QR Verified", label: "Completion certificates", tone: "text-amber-600 dark:text-amber-400" },
          ]}
        />

        <section aria-label="Openings" className="py-8 lg:py-10">
          <div className={PAGE_GUTTER}>
            {/* Rendered into the first HTML response (no JavaScript needed), so link previews,
                crawlers and slow phones see the openings; the list itself comes from the cache. */}
            <OpeningsListing searchParams={searchParams} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
