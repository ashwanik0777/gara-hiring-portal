import Link from "next/link";
import type { AdminOpeningDetail } from "../services/opening-service";
import { FormSchemaDefinition, type DocumentStorageMode } from "@/features/application-forms/types";
import { DocumentModeNotice } from "@/features/application-forms/components/document-mode-notice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Briefcase,
  Building,
  MapPin,
  Edit,
  Layers,
  CalendarCheck,
} from "lucide-react";

interface OpeningPreviewViewProps {
  opening: AdminOpeningDetail;
  /** Openings workspace the links stay in, e.g. "/admin/openings" or "/subadmin/openings". */
  basePath: string;
  /** How document fields are collected (share link vs upload), from env.DOCUMENT_STORAGE_MODE. */
  documentMode: DocumentStorageMode;
}

/**
 * Read-only preview of an opening and its active application form. Callers must
 * authorize the viewer (`canOpenings`) before rendering.
 */
export function OpeningPreviewView({ opening, basePath, documentMode }: OpeningPreviewViewProps) {
  const activeFormVersion =
    opening.formVersions.find((v) => v.id === opening.activeFormVersionId) ??
    opening.formVersions[0];
  const formSchema = (activeFormVersion?.schemaDefinition as unknown as FormSchemaDefinition) ?? {
    sections: [],
  };

  return (
    <div className="space-y-8">
      {/* Back & Actions Bar */}
      <div className="flex items-center justify-between">
        <Link
          href={`${basePath}/${opening.id}/edit`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Opening Editor
        </Link>

        <Link href={`${basePath}/${opening.id}/edit`}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Edit className="h-3.5 w-3.5" />
            Edit Details & Form
          </Button>
        </Link>
      </div>

      {/* Opening Header */}
      <div className="border-b border-border/70 pb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={opening.type === "INTERNSHIP" ? "default" : "secondary"}>
            {opening.type === "INTERNSHIP" ? "Internship Cohort" : "Full-Time Position"}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {opening.workplaceType.toLowerCase()}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Building className="h-3.5 w-3.5" />
            {opening.department}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {opening.location}
          </span>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {opening.title}
        </h1>
      </div>

      {/* Description & Requirements */}
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Role Overview
          </h3>
          <div className="text-sm text-muted-foreground bg-card/60 p-4 rounded-xl border border-border/60 whitespace-pre-line">
            {opening.description}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">Requirements</h3>
          <div className="text-sm text-muted-foreground bg-card/60 p-4 rounded-xl border border-border/60 whitespace-pre-line">
            {opening.requirements}
          </div>
        </section>

        {opening.type === "INTERNSHIP" && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <CalendarCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground block">
                  Seven-Working-Day Supervised Evaluation
                </span>
                Candidates selected for this cohort will complete an evaluated 7-working-day
                period with assigned mentors and milestone reviews.
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Form Version Preview */}
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Candidate Application Form Preview
            </CardTitle>
            <Badge variant="outline" className="font-mono text-xs">
              Active Schema: v{activeFormVersion?.versionNumber ?? 1}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <DocumentModeNotice documentMode={documentMode} />
          {formSchema.sections.map((section) => (
            <div key={section.id} className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/50">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
                {section.description && (
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {section.fields.map((field) => (
                  <div
                    key={field.id}
                    className="p-3 rounded-lg border border-border/60 bg-card text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{field.label}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-mono">
                        {field.type}
                      </span>
                    </div>
                    {field.placeholder && (
                      <p className="text-[11px] text-muted-foreground italic">
                        Placeholder: &quot;{field.placeholder}&quot;
                      </p>
                    )}
                    <div className="pt-1">
                      {field.required ? (
                        <span className="text-[10px] text-destructive font-medium">● Required</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">○ Optional</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
