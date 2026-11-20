"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CERTIFICATE_SIGNATORIES } from "@/config/site";
import { saveInternshipOfferAction } from "../actions";

export interface InternshipOfferPanelOffer {
  designation: string;
  department: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  tenureText: string;
  stipendText: string | null;
  signatoryName: string;
  signatoryTitle: string;
  version: number;
}

/**
 * Staff panel of the internship offer letter (Phase 5): issued after the supervised evaluation
 * passes and before the intern joins. Defaults come from the opening and the configured
 * signatory; the letter always states that the internship is free.
 */
export function InternshipOfferPanel({
  applicationId,
  defaults,
  offer,
  canIssue,
  isOpen,
}: {
  applicationId: string;
  defaults: { designation: string; department: string; tenureText: string; stipendText: string };
  offer: InternshipOfferPanelOffer | null;
  /** ADMIN/HR with evaluation authority. */
  canIssue: boolean;
  /** The evaluation passed and the intern has not joined yet (the letter can change). */
  isOpen: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState({
    designation: offer?.designation ?? defaults.designation,
    department: offer?.department ?? defaults.department,
    startDate: offer?.startDate ?? "",
    tenureText: offer?.tenureText ?? defaults.tenureText,
    stipendText: offer?.stipendText ?? defaults.stipendText,
    signatoryName: offer?.signatoryName ?? CERTIFICATE_SIGNATORIES.primary.name ?? "",
    signatoryTitle: offer?.signatoryTitle ?? CERTIFICATE_SIGNATORIES.primary.title,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const editable = canIssue && isOpen;

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await saveInternshipOfferAction({ applicationId, ...values });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(result.data.version === 1 ? "Offer letter issued." : `Offer letter updated (version ${result.data.version}).`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" aria-hidden="true" />
          Internship offer letter
          {offer && <span className="text-xs font-normal text-muted-foreground">version {offer.version}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOpen && !offer && (
          <p className="text-sm text-muted-foreground">
            The offer letter becomes available once the supervised evaluation has passed.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            {saved}
          </p>
        )}

        {(isOpen || offer) && (
          <form onSubmit={submit} className="space-y-4">
            <fieldset disabled={!editable || isPending} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <Input label="Role *" value={values.designation} onChange={set("designation")} maxLength={120} required />
              <Input label="Department *" value={values.department} onChange={set("department")} maxLength={100} required />
              <Input label="Start date *" type="date" value={values.startDate} onChange={set("startDate")} required />
              <Input
                label="Tenure *"
                value={values.tenureText}
                onChange={set("tenureText")}
                maxLength={120}
                placeholder="e.g. 3 months, extendable"
                required
              />
              <Input
                label="Stipend (optional)"
                value={values.stipendText}
                onChange={set("stipendText")}
                maxLength={300}
                placeholder="As agreed for this internship"
              />
              <Input label="Signatory name *" value={values.signatoryName} onChange={set("signatoryName")} maxLength={120} required />
              <Input label="Signatory title *" value={values.signatoryTitle} onChange={set("signatoryTitle")} maxLength={120} required />
            </fieldset>
            <p className="text-xs text-muted-foreground">
              The letter always states that the internship is free (no fee, deposit or certificate charge).
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {offer && (
                <a href={`/api/internship-offers/${applicationId}/letter`} className="inline-flex">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Download PDF
                  </Button>
                </a>
              )}
              {editable && (
                <Button type="submit" size="sm" isLoading={isPending}>
                  {offer ? "Update offer letter" : "Issue offer letter"}
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
