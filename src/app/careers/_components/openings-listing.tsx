import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ArrowRight, Briefcase, CalendarClock, Clock, GraduationCap, MapPin, Wallet } from "lucide-react";
import { LinkPendingReporter } from "@/components/navigation/navigation-progress";
import { EmptyState } from "@/components/feedback/empty-state";
import { getPublicOpenings } from "@/features/openings/services/opening-service";
import { listActiveTracks } from "@/features/openings/services/track-service";
import {
  MODE_FILTERS,
  TYPE_FILTERS,
  WORKPLACE_LABELS,
  formatDeadline,
  isApplicationWindowClosed,
  matchesCareersFilters,
  parseCareersFilters,
  type CareersFilters,
} from "@/features/openings/listing";
import {
  externalReferrerHost,
  pickAttributionParams,
  toAttributionQuery,
  type AttributionParams,
} from "@/features/applications/source-tracking";
import { getSiteUrl } from "@/lib/site-url";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A /careers URL with the filters and the campaign parameters (so attribution survives filtering). */
function careersHref(path: string, filters: CareersFilters, attribution: AttributionParams): string {
  const query = new URLSearchParams(toAttributionQuery(attribution).replace(/^\?/, ""));
  if (filters.type) query.set("type", filters.type);
  if (filters.mode) query.set("mode", filters.mode);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border/80 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/** One option of a segmented filter (Type, Mode). */
function SegmentLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function FilterGroup({ label, children, segmented = false }: { label: string; children: React.ReactNode; segmented?: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {segmented ? (
        <div className="inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">{children}</div>
      ) : (
        <div className="flex flex-wrap gap-2">{children}</div>
      )}
    </div>
  );
}

/**
 * The careers listing shared by /careers and /careers/tracks/{slug}: filter links (plain links,
 * so they work without JavaScript and can be crawled), then the open openings. The list and the
 * tracks come from the shared cache; the deadline is compared here, at request time, so an
 * opening disappears the moment its last day ends.
 */
export async function OpeningsListing({
  searchParams,
  trackSlug,
}: {
  searchParams: SearchParams;
  /** Show only this track's openings (track pages). */
  trackSlug?: string;
}) {
  const params = await searchParams;
  const filters = parseCareersFilters(params);
  const attribution = pickAttributionParams(params);
  if (!attribution.ref) {
    const referrerHost = externalReferrerHost((await headers()).get("referer"), getSiteUrl());
    if (referrerHost) attribution.ref = referrerHost;
  }
  const attributionQuery = toAttributionQuery(attribution);
  const basePath = trackSlug ? `/careers/tracks/${trackSlug}` : "/careers";

  let openings: Awaited<ReturnType<typeof getPublicOpenings>>;
  let tracks: Awaited<ReturnType<typeof listActiveTracks>>;
  try {
    [openings, tracks] = await Promise.all([
      getPublicOpenings(trackSlug ? { trackSlug } : undefined),
      listActiveTracks(),
    ]);
  } catch {
    // Keep the page (heading, navigation, footer) and explain, instead of the error screen.
    return (
      <p role="status" className="mx-auto max-w-xl rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
        Openings could not be loaded right now. Please refresh the page in a moment.
      </p>
    );
  }

  await connection();
  const now = new Date();
  const open = openings.filter((opening) => !isApplicationWindowClosed(opening.applyDeadline, now));
  const visible = open.filter((opening) => matchesCareersFilters(opening, filters));
  const hasFilters = Boolean(filters.type || filters.mode);

  return (
    <div className="space-y-6">
      <nav aria-label="Filter openings" className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-5">
        {tracks.length > 0 && (
          <FilterGroup label="Track">
            <FilterChip href={careersHref("/careers", filters, attribution)} active={!trackSlug}>
              All tracks
            </FilterChip>
            {tracks.map((track) => (
              <FilterChip
                key={track.id}
                href={careersHref(`/careers/tracks/${track.slug}`, filters, attribution)}
                active={track.slug === trackSlug}
              >
                {track.name}
              </FilterChip>
            ))}
          </FilterGroup>
        )}
        <div className="flex flex-col gap-4 border-t border-border/60 pt-4 lg:flex-row lg:items-center lg:gap-10">
          <FilterGroup label="Type" segmented>
            <SegmentLink href={careersHref(basePath, { ...filters, type: undefined }, attribution)} active={!filters.type}>
              All
            </SegmentLink>
            {TYPE_FILTERS.map((filter) => (
              <SegmentLink
                key={filter.value}
                href={careersHref(basePath, { ...filters, type: filter.value }, attribution)}
                active={filters.type === filter.value}
              >
                {filter.label}
              </SegmentLink>
            ))}
          </FilterGroup>
          <FilterGroup label="Mode" segmented>
            <SegmentLink href={careersHref(basePath, { ...filters, mode: undefined }, attribution)} active={!filters.mode}>
              Any
            </SegmentLink>
            {MODE_FILTERS.map((filter) => (
              <SegmentLink
                key={filter.value}
                href={careersHref(basePath, { ...filters, mode: filter.value }, attribution)}
                active={filters.mode === filter.value}
              >
                {filter.label}
              </SegmentLink>
            ))}
          </FilterGroup>
        </div>
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          title={hasFilters || trackSlug ? "No openings match these filters" : "No open positions currently available"}
          icon={<Briefcase className="h-6 w-6 text-primary" />}
          action={
            hasFilters || trackSlug ? (
              <Link
                href={careersHref("/careers", {}, attribution)}
                className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              >
                See all openings
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{visible.length}</span> open {visible.length === 1 ? "role" : "roles"}
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((opening) => {
              const internship = opening.type === "INTERNSHIP";
              return (
                <div
                  key={opening.id}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-border/80 bg-card shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex flex-1 flex-col gap-4 p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          internship ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {internship ? <GraduationCap className="h-3 w-3" aria-hidden="true" /> : <Briefcase className="h-3 w-3" aria-hidden="true" />}
                        {internship ? "Internship" : "Full-time"}
                      </span>
                      {opening.track && (
                        <span className="truncate rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{opening.track.name}</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h3 className="line-clamp-2 font-[family-name:var(--font-display)] text-xl font-bold leading-snug text-foreground">{opening.title}</h3>
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{opening.summary ?? opening.description}</p>
                    </div>
                    <ul className="mt-auto space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="truncate">
                          {WORKPLACE_LABELS[opening.workplaceType]} · {opening.location}
                        </span>
                      </li>
                      {opening.durationText && (
                        <li className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate">{opening.durationText}</span>
                        </li>
                      )}
                      {opening.stipendPolicyText && (
                        <li className="flex items-center gap-2">
                          <Wallet className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                          <span className="line-clamp-1">{opening.stipendPolicyText}</span>
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
                    {opening.applyDeadline ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        Apply by {formatDeadline(opening.applyDeadline)}
                      </p>
                    ) : (
                      <span />
                    )}
                    <Link
                      href={`/careers/${opening.slug}${attributionQuery}`}
                      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      View role <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      <span className="sr-only">: {opening.title}</span>
                      <LinkPendingReporter />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
