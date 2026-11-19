import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ArrowRight, Briefcase, CalendarClock, Clock, MapPin, Wallet } from "lucide-react";
import { LinkPendingReporter } from "@/components/navigation/navigation-progress";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/80 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
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
    <div className="space-y-8">
      <nav aria-label="Filter openings" className="space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
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
        <FilterGroup label="Type">
          <FilterChip href={careersHref(basePath, { ...filters, type: undefined }, attribution)} active={!filters.type}>
            All
          </FilterChip>
          {TYPE_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              href={careersHref(basePath, { ...filters, type: filter.value }, attribution)}
              active={filters.type === filter.value}
            >
              {filter.label}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Mode">
          <FilterChip href={careersHref(basePath, { ...filters, mode: undefined }, attribution)} active={!filters.mode}>
            Any
          </FilterChip>
          {MODE_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              href={careersHref(basePath, { ...filters, mode: filter.value }, attribution)}
              active={filters.mode === filter.value}
            >
              {filter.label}
            </FilterChip>
          ))}
        </FilterGroup>
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          title={hasFilters || trackSlug ? "No openings match these filters" : "No open positions currently available"}
          description={
            hasFilters || trackSlug
              ? "Try another track, type or work mode, or see every opening."
              : "We do not have active public vacancies at this moment. New cohorts are published regularly, please check back soon."
          }
          icon={<Briefcase className="h-6 w-6 text-primary" />}
          action={
            hasFilters || trackSlug ? (
              <Link href={careersHref("/careers", {}, attribution)}>
                <Button variant="outline" size="sm">
                  See all openings
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {visible.map((opening) => (
            <Card
              key={opening.id}
              className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge variant={opening.type === "INTERNSHIP" ? "default" : "secondary"}>
                    {opening.type === "INTERNSHIP" ? "Internship Cohort" : "Full-Time Position"}
                  </Badge>
                  {opening.track && <span className="truncate text-xs font-medium text-primary">{opening.track.name}</span>}
                </div>
                <CardTitle className="font-[family-name:var(--font-display)] text-xl font-bold line-clamp-2">
                  {opening.title}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 pb-4">
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {opening.summary ?? opening.description}
                </p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {WORKPLACE_LABELS[opening.workplaceType]} · {opening.location}
                    </span>
                  </li>
                  {opening.durationText && (
                    <li className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{opening.durationText}</span>
                    </li>
                  )}
                  {opening.stipendPolicyText && (
                    <li className="flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-1">{opening.stipendPolicyText}</span>
                    </li>
                  )}
                  {opening.applyDeadline && (
                    <li className="flex items-center gap-1.5 font-medium text-foreground">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Apply by {formatDeadline(opening.applyDeadline)}
                    </li>
                  )}
                </ul>
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
      )}
    </div>
  );
}
