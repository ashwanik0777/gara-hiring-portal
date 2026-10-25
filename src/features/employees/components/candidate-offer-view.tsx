"use client";

import React, { useId, useRef, useState } from "react";
import { OfferStatus, JobOfferDetail } from "../types";
import { candidateDecideOfferAction } from "../actions";
import {
  OFFER_ESIGN_CONSENT_TEXT,
  OFFER_SIGNED_NAME_MAX_LENGTH,
  offerLetterDownloadPath,
  signatureNamesMatch,
} from "../offer-esign";
import { linkButtonClass } from "@/features/lifecycle/components/self-service-ui";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Calendar,
  MapPin,
  CheckCircle2,
  AlertCircle,
  FileDown,
  PenLine,
  ThumbsDown,
} from "lucide-react";

interface CandidateOfferViewProps {
  offer: JobOfferDetail;
}

/** Only offers that were formally extended are shown to candidates; drafts and revoked offers stay internal. */
const CANDIDATE_VISIBLE_STATUSES: OfferStatus[] = [
  OfferStatus.EXTENDED,
  OfferStatus.ACCEPTED,
  OfferStatus.DECLINED,
];

const NETWORK_ERROR = "We couldn't send your answer. Please check your connection and try again.";

type FieldErrors = Partial<Record<"signedName" | "consent", string>>;

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}

function formatDay(value: Date | string | null | undefined): string {
  return new Date(value ?? Date.now()).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function CandidateOfferView({ offer }: CandidateOfferViewProps) {
  const formId = useId();
  const nameId = `${formId}-signed-name`;
  const nameHintId = `${formId}-signed-name-hint`;
  const nameErrorId = `${formId}-signed-name-error`;
  const consentId = `${formId}-consent`;
  const consentErrorId = `${formId}-consent-error`;
  const declineId = `${formId}-decline-reason`;

  const [mode, setMode] = useState<"ACCEPT" | "DECLINE">("ACCEPT");
  const [signedName, setSignedName] = useState("");
  const [consent, setConsent] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const nameInputRef = useRef<HTMLInputElement>(null);
  const consentInputRef = useRef<HTMLInputElement>(null);

  const accountName = offer.candidateName ?? "";
  const letterPath = offerLetterDownloadPath(offer.id);

  const send = async (formData: FormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await candidateDecideOfferAction(formData);
      if (!res.success) {
        setError(res.error);
        setFieldErrors({
          signedName: res.fieldErrors?.signedName,
          consent: res.fieldErrors?.consent,
        });
        if (res.fieldErrors?.signedName) nameInputRef.current?.focus();
        else if (res.fieldErrors?.consent) consentInputRef.current?.focus();
      } else {
        setMode("ACCEPT");
        setFieldErrors({});
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (signedName.trim().length < 2) {
      errors.signedName = "Type your full legal name to sign.";
    } else if (accountName && !signatureNamesMatch(signedName, accountName)) {
      errors.signedName = `The name must match the name on your account: ${accountName}.`;
    }
    if (!consent) {
      errors.consent = "Tick the box to confirm you have read the offer letter and agree to accept it electronically.";
    }
    setFieldErrors(errors);
    if (errors.signedName || errors.consent) {
      setError(null);
      // Move focus to the first field that needs attention.
      (errors.signedName ? nameInputRef : consentInputRef).current?.focus();
      return;
    }

    const formData = new FormData();
    formData.append("offerId", offer.id);
    formData.append("decision", "ACCEPT");
    formData.append("signedName", signedName);
    formData.append("consent", "true");
    formData.append("letterHash", offer.letterHash ?? "");
    void send(formData);
  };

  const handleDecline = () => {
    const formData = new FormData();
    formData.append("offerId", offer.id);
    formData.append("decision", "DECLINE");
    formData.append("declineReason", declineReason);
    void send(formData);
  };

  if (!CANDIDATE_VISIBLE_STATUSES.includes(offer.status)) {
    return null;
  }

  const signature = offer.signature ?? null;

  return (
    <Card className="border-primary/40 bg-card shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2 text-primary font-bold">
              <Briefcase className="h-5 w-5" aria-hidden="true" /> Official Employment Offer
            </CardTitle>
          </div>
          {offer.status === OfferStatus.EXTENDED && (
            <Badge variant="warning">Action Required</Badge>
          )}
          {offer.status === OfferStatus.ACCEPTED && (
            <Badge variant="success">Offer Accepted</Badge>
          )}
          {offer.status === OfferStatus.DECLINED && (
            <Badge variant="destructive">Offer Declined</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4 text-xs">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/40 border border-border/40">
          <div>
            <div className="text-muted-foreground text-[11px]">Position</div>
            <div className="font-semibold text-foreground text-sm mt-0.5">
              {offer.designation}
            </div>
            <div className="text-muted-foreground">{offer.department}</div>
          </div>

          <div>
            <div className="text-muted-foreground text-[11px] flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden="true" /> Target Joining Date
            </div>
            <div className="font-semibold text-foreground text-sm mt-0.5">
              {new Date(offer.expectedJoiningDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground text-[11px] flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" /> Location
            </div>
            <div className="font-semibold text-foreground text-sm mt-0.5">
              {offer.location || "Not specified"}
            </div>
          </div>
        </div>

        <div>
          <div className="font-semibold text-foreground mb-1 text-sm">Agreed Terms & Conditions:</div>
          <div className="p-4 rounded-md bg-muted/20 border border-border/60 text-foreground whitespace-pre-wrap leading-relaxed text-xs">
            {offer.termsSummary}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border/60 p-3">
          <p className="text-muted-foreground">
            {offer.status === OfferStatus.ACCEPTED && signature
              ? "Your signed offer letter, including the electronic acceptance."
              : "The formal offer letter (PDF) with the details above."}
          </p>
          <a href={letterPath} className={linkButtonClass("outline", "sm", "shrink-0")}>
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
            {offer.status === OfferStatus.EXTENDED
              ? "Review offer letter"
              : offer.status === OfferStatus.ACCEPTED && signature
                ? "Download signed offer letter"
                : "Download offer letter"}
          </a>
        </div>

        {offer.status === OfferStatus.ACCEPTED && (
          <div className="p-4 rounded-lg bg-success/10 border border-success/30 text-success flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold text-sm">Congratulations & Welcome!</div>
              {signature ? (
                <div className="text-xs text-foreground/80 mt-0.5 space-y-1">
                  <p>
                    You accepted this offer electronically as <strong>{signature.signedName}</strong> on{" "}
                    <time dateTime={new Date(signature.signedAt).toISOString()} suppressHydrationWarning>
                      {formatDateTime(signature.signedAt)}
                    </time>
                    . Our HR operations team is preparing your onboarding package.
                  </p>
                  <p className="text-muted-foreground">
                    Document hash: <span className="font-mono break-all">{signature.documentHash.slice(0, 16)}</span>
                  </p>
                </div>
              ) : (
                <div className="text-xs text-foreground/80 mt-0.5">
                  You formally accepted this job offer on {formatDay(offer.decisionAt)}. Our HR operations team is preparing your onboarding package.
                </div>
              )}
            </div>
          </div>
        )}

        {offer.status === OfferStatus.DECLINED && (
          <div className="p-3 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground text-xs">
            You declined this job offer on {formatDay(offer.decisionAt)}.
          </div>
        )}
      </CardContent>

      {offer.status === OfferStatus.EXTENDED && (
        <CardFooter className="pt-4 border-t border-border/50 block">
          {mode === "DECLINE" ? (
            <div className="w-full space-y-3">
              <label htmlFor={declineId} className="block text-xs font-medium text-foreground">
                Please share the reason for declining this offer (optional):
              </label>
              <textarea
                id={declineId}
                rows={2}
                maxLength={1000}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining..."
                className="w-full px-3 py-2 text-xs rounded-md border border-input bg-background resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("ACCEPT")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDecline}
                  disabled={isSubmitting}
                >
                  Confirm Decline
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAccept} noValidate className="w-full space-y-4" aria-labelledby={`${formId}-heading`}>
              <div className="space-y-1">
                <h3 id={`${formId}-heading`} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <PenLine className="h-4 w-4 text-primary" aria-hidden="true" /> Accept electronically
                </h3>
                <p className="text-xs text-muted-foreground">
                  Review the offer letter first. Accepting signs it with the name you type below. We record the date
                  and time, your browser and a one-way fingerprint of your network address as evidence of your
                  acceptance.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={nameId} className="block text-xs font-semibold text-foreground">
                  Full legal name
                </label>
                <input
                  ref={nameInputRef}
                  id={nameId}
                  name="signedName"
                  type="text"
                  autoComplete="name"
                  maxLength={OFFER_SIGNED_NAME_MAX_LENGTH}
                  value={signedName}
                  onChange={(e) => setSignedName(e.target.value)}
                  aria-invalid={fieldErrors.signedName ? true : undefined}
                  aria-describedby={fieldErrors.signedName ? `${nameHintId} ${nameErrorId}` : nameHintId}
                  disabled={isSubmitting}
                  className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-2xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive"
                />
                <p id={nameHintId} className="text-[11px] text-muted-foreground">
                  {accountName
                    ? `Type your name as shown on your account: ${accountName}.`
                    : "Type your name as shown on your account."}
                </p>
                {fieldErrors.signedName && (
                  <p id={nameErrorId} className="text-xs text-destructive">
                    {fieldErrors.signedName}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <input
                    ref={consentInputRef}
                    id={consentId}
                    name="consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    aria-invalid={fieldErrors.consent ? true : undefined}
                    aria-describedby={fieldErrors.consent ? consentErrorId : undefined}
                    disabled={isSubmitting}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label htmlFor={consentId} className="text-xs text-foreground">
                    {OFFER_ESIGN_CONSENT_TEXT}
                  </label>
                </div>
                {fieldErrors.consent && (
                  <p id={consentErrorId} className="text-xs text-destructive">
                    {fieldErrors.consent}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setMode("DECLINE");
                  }}
                  disabled={isSubmitting}
                  className="gap-1.5"
                >
                  <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> Decline Offer
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
                  <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                  {isSubmitting ? "Signing…" : "Accept job offer"}
                </Button>
              </div>
            </form>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
