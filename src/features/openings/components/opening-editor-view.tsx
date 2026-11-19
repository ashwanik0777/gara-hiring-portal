import Link from "next/link";
import type { AdminOpeningDetail } from "../services/opening-service";
import { OpeningStatusActions } from "./opening-status-actions";
import { OpeningForm, type OpeningFormTrackOption } from "./opening-form";
import { dateKeyFromDeadline } from "../listing";
import { FormBuilder } from "@/features/application-forms/components/form-builder";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, Eye, Settings, FileSpreadsheet } from "lucide-react";
import type { CreateOpeningInput } from "../schemas";

interface OpeningEditorViewProps {
  opening: AdminOpeningDetail;
  /** Openings workspace the links stay in, e.g. "/admin/openings" or "/subadmin/openings". */
  basePath: "/admin/openings" | "/subadmin/openings";
  /** Tracks the details form can assign (see getTrackOptions). */
  tracks: OpeningFormTrackOption[];
}

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
 * Opening lifecycle controls and form builder. Callers must authorize the viewer
 * (`canOpenings`) before rendering; the Server Actions re-check on every write.
 */
export function OpeningEditorView({ opening, basePath, tracks }: OpeningEditorViewProps) {
  const latestFormVersion = opening.formVersions[0];
  const initialSchema = (latestFormVersion?.schemaDefinition as unknown as FormSchemaDefinition) ?? {
    sections: [],
  };

  return (
    <div className="space-y-8">
      {/* Back Link & Header */}
      <div>
        <Link
          href={basePath}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Openings List
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{opening.title}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`${basePath}/${opening.id}/preview`}
              className="inline-flex items-center justify-center font-medium rounded-lg border border-border bg-card hover:bg-accent text-xs h-9 px-3 gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview Live Appearance
            </Link>
          </div>
        </div>
      </div>

      {/* Section 1: Opening Lifecycle & Status Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Vacancy Lifecycle Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OpeningStatusActions openingId={opening.id} currentStatus={opening.status} />
        </CardContent>
      </Card>

      {/* Section 2: Opening details (title, listing details, description) */}
      <OpeningForm basePath={basePath} tracks={tracks} opening={{ id: opening.id, values: toFormValues(opening) }} />

      {/* Section 3: Dynamic Form Builder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Dynamic Application Form Builder
          </CardTitle>
        </CardHeader>
        <CardContent>
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
