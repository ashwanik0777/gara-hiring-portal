import Link from "next/link";
import {
  BookOpen,
  CalendarClock,
  CalendarRange,
  Clock,
  ExternalLink,
  IndianRupee,
  Link2,
  RotateCcw,
  Settings2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { FilterChipLink } from "@/features/employees/components/filter-chip-link";
import { ExportLinks } from "@/features/exports/export-links";
import { formatDeadline } from "@/features/openings/listing";
import { formatInr } from "../money";
import type { StaffTrainingProgram, TrainingOverview } from "../services/program-service";

export type ProgramStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const STATUS_META: Record<ProgramStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  PUBLISHED: { label: "Published", variant: "default" },
  DRAFT: { label: "Draft", variant: "secondary" },
  ARCHIVED: { label: "Archived", variant: "outline" },
};
const STATUS_ORDER: ProgramStatus[] = ["PUBLISHED", "DRAFT", "ARCHIVED"];

const actionLink =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

export function parseProgramStatusFilter(value: string | string[] | undefined): ProgramStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (STATUS_ORDER as string[]).includes(raw) ? (raw as ProgramStatus) : null;
}

/** /admin/training: summary cards, status filters with exports, and the programme list. */
export function TrainingOverviewView({ overview, status }: { overview: TrainingOverview; status: ProgramStatus | null }) {
  const { programs, totals } = overview;
  const countOf = (value: ProgramStatus) => programs.filter((program) => program.status === value).length;
  const visible = status ? programs.filter((program) => program.status === status) : programs;
  const hrefFor = (value: ProgramStatus | null) => (value ? `/admin/training?status=${value}` : "/admin/training");

  return (
    <div className="w-full space-y-6">
      <StatGrid columns={4} label="Training summary">
        <StatCard label="Programmes" value={totals.programs} icon={BookOpen} tone="blue" href={hrefFor(null)} />
        <StatCard label="Open Batches" value={totals.openBatches} icon={CalendarRange} tone="amber" />
        <StatCard label="Enrolled Students" value={totals.enrolled} icon={Users} tone="emerald" />
        <StatCard label="Refund Requests" value={totals.pendingRefunds} icon={RotateCcw} tone="rose" href="/admin/training/refunds" />
      </StatGrid>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter programmes by status" className="flex flex-wrap gap-2">
          <FilterChipLink href={hrefFor(null)} active={status === null} label="All" count={programs.length} />
          {STATUS_ORDER.filter((value) => countOf(value) > 0 || value === status).map((value) => (
            <FilterChipLink key={value} href={hrefFor(value)} active={status === value} label={STATUS_META[value].label} count={countOf(value)} />
          ))}
        </nav>
        <ExportLinks
          items={[
            { dataset: "training-enrollments", label: "Enrollments CSV" },
            { dataset: "training-payments", label: "Payments CSV" },
            { dataset: "certificates", label: "Certificates CSV" },
          ]}
        />
      </div>

      {programs.length === 0 ? (
        <EmptyState
          title="No programmes yet"
          action={
            <Link href="/admin/training/new">
              <Button size="sm">New Programme</Button>
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={`No ${status ? STATUS_META[status].label.toLowerCase() : ""} programmes`}
          action={
            <Link href="/admin/training">
              <Button size="sm" variant="outline">
                Show all programmes
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3" aria-label="Programmes">
          {visible.map((program) => {
            const meta = STATUS_META[program.status];
            return (
              <li key={program.id} className="rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={meta.variant} className="text-[11px]">
                        {meta.label}
                      </Badge>
                      {program.track && (
                        <Badge variant="outline" className="border-primary/30 text-[11px] text-primary">
                          {program.track.name}
                        </Badge>
                      )}
                    </div>
                    <Link
                      href={`/admin/training/${program.id}`}
                      className="block text-base font-semibold text-foreground wrap-break-word hover:text-primary focus-visible:outline-none focus-visible:underline"
                    >
                      {program.title}
                    </Link>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <li className="inline-flex items-center gap-1.5">
                        <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatInr(program.feePaise)}
                      </li>
                      <li className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {plural(program.durationWeeks, "week")}
                      </li>
                      <li className="inline-flex items-center gap-1.5">
                        <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                        {program.openBatches} open of {plural(program._count.batches, "batch", "batches")}
                      </li>
                      <li className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        {plural(program.enrolled, "student")}
                      </li>
                      {program.nextStart && (
                        <li className="inline-flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                          Next batch {formatDeadline(program.nextStart)}
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`/admin/training/${program.id}`} className={actionLink}>
                      <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Manage
                    </Link>
                    {program.status === "PUBLISHED" && (
                      <a href={`/training/${program.slug}`} target="_blank" rel="noopener noreferrer" className={actionLink}>
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
    </div>
  );
}

/** Top of /admin/training/{id}: status, track, title and key facts, with a link to the live page. */
export function ProgramSummaryCard({ program }: { program: StaffTrainingProgram }) {
  const meta = STATUS_META[program.status];
  const enrolled = program.batches.reduce((sum, batch) => sum + batch._count.enrollments, 0);
  const openBatches = program.batches.filter((batch) => batch.status === "UPCOMING" || batch.status === "RUNNING").length;
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {program.track && (
              <Badge variant="outline" className="border-primary/30 text-primary">
                {program.track.name}
              </Badge>
            )}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground wrap-break-word sm:text-2xl">{program.title}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Programme facts">
            <li className="inline-flex items-center gap-1.5">
              <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
              {formatInr(program.feePaise)}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(program.durationWeeks, "week")}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              {openBatches} open of {plural(program.batches.length, "batch", "batches")}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(enrolled, "student")}
            </li>
            <li className="inline-flex min-w-0 items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono">/training/{program.slug}</span>
            </li>
          </ul>
        </div>
        {program.status === "PUBLISHED" && (
          <a href={`/training/${program.slug}`} target="_blank" rel="noopener noreferrer" className={actionLink}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            View on site
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </CardContent>
    </Card>
  );
}
