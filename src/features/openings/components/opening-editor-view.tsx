import Link from "next/link";
import type { AdminOpeningDetail } from "../services/opening-service";
import { OpeningStatusActions } from "./opening-status-actions";
import { OpeningForm, type OpeningFormTrackOption } from "./opening-form";
import { dateKeyFromDeadline } from "../listing";
import { FormBuilder } from "@/features/application-forms/components/form-builder";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building, ExternalLink, Eye, FileSpreadsheet, Link2, MapPin, Monitor, Settings } from "lucide-react";
import type { CreateOpeningInput } from "../schemas";

interface OpeningEditorViewProps {
  opening: AdminOpeningDetail;
  /** Openings workspace the links stay in, e.g. "/admin/openings" or "/subadmin/openings". */
  basePath: "/admin/openings" | "/subadmin/openings";
  /** Tracks the details form can assign (see getTrackOptions). */
  tracks: OpeningFormTrackOption[];
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "warning" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  PUBLISHED: { label: "Published", variant: "default" },
  PAUSED: { label: "Paused", variant: "warning" },
  CLOSED: { label: "Closed", variant: "destructive" },
};

const WORKPLACE_LABELS: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ON_SITE: "On-site" };

const buttonLink =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** The opening's saved values in the shape of the details form. */
function toFormValues(opening: AdminOpeningDetail): CreateOpeningInput {
  return {
    title: opening.title,
    slug: opening.slug,
    department: opening.department,
    type: opening.type,
    location: opening.location,
    workplaceType: opening.workplaceType,
    description: opening.description,
    requirements: opening.requirements,
    responsibilities: opening.responsibilities ?? "",
    trackId: opening.trackId ?? "",
    summary: opening.summary ?? "",
    skills: opening.skills,
    eligibility: opening.eligibility ?? "",
    durationText: opening.durationText ?? "",
    stipendPolicyText: opening.stipendPolicyText ?? "",
    openingsCount: opening.openingsCount,
    applyDeadline: opening.applyDeadline ? dateKeyFromDeadline(opening.applyDeadline) : "",
  };
}

/**
 * Opening summary, status controls, details form and application form builder. Callers
 * must authorize the viewer (`canOpenings`) before rendering; the Server Actions re-check
 * on every write. The page header (portal shell) carries the title and the way back.
 */
export function OpeningEditorView({ opening, basePath, tracks }: OpeningEditorViewProps) {
  const latestFormVersion = opening.formVersions[0];
  const initialSchema = (latestFormVersion?.schemaDefinition as unknown as FormSchemaDefinition) ?? {
    sections: [],
  };
  const status = STATUS_BADGE[opening.status] ?? { label: opening.status, variant: "secondary" as const };
  const publicPath = `/careers/${opening.slug}`;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.variant}>{status.label}</Badge>
              <Badge variant="outline">{opening.type === "INTERNSHIP" ? "Internship" : "Full-time"}</Badge>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground wrap-break-word sm:text-2xl">{opening.title}</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Opening facts">
              <li className="inline-flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" aria-hidden="true" />
                {opening.department}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                {WORKPLACE_LABELS[opening.workplaceType] ?? opening.workplaceType}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {opening.location}
              </li>
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate font-mono">{publicPath}</span>
              </li>
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={`${basePath}/${opening.id}/preview`} className={buttonLink}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Preview
            </Link>
            {opening.status === "PUBLISHED" && (
              <a href={publicPath} target="_blank" rel="noopener noreferrer" className={buttonLink}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                View on careers page
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      <Card className="shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
            Status
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <OpeningStatusActions openingId={opening.id} currentStatus={opening.status} />
        </CardContent>
      </Card>

      {/* Details */}
      <OpeningForm basePath={basePath} tracks={tracks} opening={{ id: opening.id, values: toFormValues(opening) }} />

      {/* Application form */}
      <Card className="shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" />
            Application form
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <FormBuilder
            openingId={opening.id}
            initialSchema={initialSchema}
            currentVersionNumber={latestFormVersion?.versionNumber ?? 1}
            isOpeningPublished={opening.status === "PUBLISHED"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
