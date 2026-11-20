import { Download, FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const UPDATED = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: BUSINESS_TIME_ZONE });

/** The candidate's internship offer letter (Phase 5): key details and the PDF. */
export function CandidateInternshipOffer({
  applicationId,
  offer,
}: {
  applicationId: string;
  offer: { designation: string; department: string; startDate: Date; tenureText: string; version: number; updatedAt: Date };
}) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" aria-hidden="true" />
          Your internship offer letter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <dt className="text-xs text-muted-foreground">Role</dt>
            <dd className="font-medium text-foreground">{offer.designation}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Department</dt>
            <dd className="font-medium text-foreground">{offer.department}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Start date</dt>
            <dd className="font-medium text-foreground">{DAY.format(offer.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tenure</dt>
            <dd className="font-medium text-foreground">{offer.tenureText}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            Version {offer.version}, updated {UPDATED.format(offer.updatedAt)}. This internship is free of charge.
          </p>
          <a
            href={`/api/internship-offers/${applicationId}/letter`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download offer letter (PDF)
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
