import Link from "next/link";
import { OpeningStatus } from "@prisma/client";
import { Briefcase, Building2, CalendarClock, CheckCircle2, ExternalLink, Eye, FilePen, FileText, MapPin, Pencil, Users } from "lucide-react";
import type { getAdminOpenings } from "../services/opening-service";
import type { StaffTrack } from "../services/track-service";
import { formatDeadline, isApplicationWindowClosed, OPENING_TYPE_LABELS, WORKPLACE_LABELS } from "../listing";
import { TrackManager, type TrackManagerRow } from "./track-manager";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { FilterChipLink } from "@/features/employees/components/filter-chip-link";
import { Button } from "@/components/ui/button";

type OpeningRow = Awaited<ReturnType<typeof getAdminOpenings>>[number];

const STATUS_META: Record<OpeningStatus, { label: string; variant: "default" | "secondary" | "warning" | "destructive" }> = {
  PUBLISHED: { label: "Published", variant: "default" },
  DRAFT: { label: "Draft", variant: "secondary" },
  PAUSED: { label: "Paused", variant: "warning" },
  CLOSED: { label: "Closed", variant: "destructive" },
};
const STATUS_ORDER: OpeningStatus[] = [OpeningStatus.PUBLISHED, OpeningStatus.DRAFT, OpeningStatus.PAUSED, OpeningStatus.CLOSED];

const actionLink =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Staff track rows as plain data for the client-side track manager. */
export function toTrackRows(tracks: StaffTrack[]): TrackManagerRow[] {
  return tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    name: track.name,
    description: track.description,
    sortOrder: track.sortOrder,
    isActive: track.isActive,
    openingsCount: track._count.openings,
    programmesCount: track._count.programmes,
  }));
}

export function parseOpeningStatusFilter(value: string | string[] | undefined): OpeningStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (STATUS_ORDER as string[]).includes(raw) ? (raw as OpeningStatus) : null;
}

/**
 * The openings workspace shared by the admin and staff portals: summary cards, status filters,
 * the openings list and the career tracks. Callers authorize the viewer (canOpenings) and load
 * the data; every write re-checks on the server.
 */
export function OpeningsOverview({
  openings,
  tracks,
  basePath,
  status,
  now,
}: {
  openings: OpeningRow[];
  tracks: TrackManagerRow[];
  basePath: "/admin/openings" | "/subadmin/openings";
  status: OpeningStatus | null;
  now: Date;
}) {
  const countOf = (value: OpeningStatus) => openings.filter((opening) => opening.status === value).length;
  const applications = openings.reduce((sum, opening) => sum + opening._count.applications, 0);
  const visible = status ? openings.filter((opening) => opening.status === status) : openings;
  const hrefFor = (value: OpeningStatus | null) => (value ? `${basePath}?status=${value}` : basePath);

  return (
    <div className="w-full space-y-6">
      <StatGrid columns={4} label="Openings summary">
        <StatCard label="Total Openings" value={openings.length} icon={Briefcase} tone="blue" href={hrefFor(null)} />
        <StatCard label="Published" value={countOf(OpeningStatus.PUBLISHED)} icon={CheckCircle2} tone="emerald" href={hrefFor(OpeningStatus.PUBLISHED)} />
        <StatCard label="Drafts" value={countOf(OpeningStatus.DRAFT)} icon={FilePen} tone="amber" href={hrefFor(OpeningStatus.DRAFT)} />
        <StatCard label="Applications" value={applications} icon={Users} tone="violet" />
      </StatGrid>

      <nav aria-label="Filter openings by status" className="flex flex-wrap gap-2">
        <FilterChipLink href={hrefFor(null)} active={status === null} label="All" count={openings.length} />
        {STATUS_ORDER.filter((value) => countOf(value) > 0 || value === status).map((value) => (
          <FilterChipLink
            key={value}
            href={hrefFor(value)}
            active={status === value}
            label={STATUS_META[value].label}
            count={countOf(value)}
          />
        ))}
      </nav>

      {openings.length === 0 ? (
        <EmptyState
          title="No openings yet"
          action={
            <Link href={`${basePath}/new`}>
              <Button size="sm">Create Opening</Button>
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={`No ${status ? STATUS_META[status].label.toLowerCase() : ""} openings`}
          action={
            <Link href={basePath}>
              <Button size="sm" variant="outline">
                Show all openings
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3" aria-label="Openings">
          {visible.map((opening) => {
            const meta = STATUS_META[opening.status];
            const live = opening.formVersions[0];
            const closedForApplications = isApplicationWindowClosed(opening.applyDeadline, now);
            return (
              <li
                key={opening.id}
                className="rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={meta.variant} className="text-[11px]">
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {OPENING_TYPE_LABELS[opening.type]}
                      </Badge>
                      {opening.track && (
                        <Badge variant="outline" className="border-primary/30 text-[11px] text-primary">
                          {opening.track.name}
                        </Badge>
                      )}
                    </div>
                    <Link
                      href={`${basePath}/${opening.id}/edit`}
                      className="block text-base font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline wrap-break-word"
                    >
                      {opening.title}
                    </Link>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <li className="inline-flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {opening.department}
                      </li>
                      <li className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {opening.location} · {WORKPLACE_LABELS[opening.workplaceType]}
                      </li>
                      {opening.applyDeadline && (
                        <li className={`inline-flex items-center gap-1.5 ${closedForApplications ? "text-destructive" : ""}`}>
                          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                          {closedForApplications ? "Closed " : "Apply by "}
                          {formatDeadline(opening.applyDeadline)}
                        </li>
                      )}
                      <li className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        {opening._count.applications} application{opening._count.applications === 1 ? "" : "s"}
                      </li>
                      <li className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        {live ? `Form v${live.versionNumber}` : "Form not published"}
                      </li>
                    </ul>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`${basePath}/${opening.id}/edit`} className={actionLink}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Link>
                    <Link href={`${basePath}/${opening.id}/preview`} className={actionLink}>
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      Preview
                    </Link>
                    {opening.status === OpeningStatus.PUBLISHED && (
                      <a href={`/careers/${opening.slug}`} target="_blank" rel="noopener noreferrer" className={actionLink}>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Live
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TrackManager tracks={tracks} />
    </div>
  );
}
