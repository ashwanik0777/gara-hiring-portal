"use client";

import React, { useState } from "react";
import { EmployeeStatus, OfferStatus, JobOfferDetail } from "../types";
import { extendJobOfferAction, revokeJobOfferAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  XCircle,
  UserPlus,
  FileDown,
  PenLine,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { HireEmployeeModal } from "./hire-employee-modal";
import { joiningDatePrefill } from "../joining";
import { offerLetterDownloadPath } from "../offer-esign";
import { linkButtonClass } from "@/features/lifecycle/components/self-service-ui";

interface JobOfferCardProps {
  offer: JobOfferDetail;
  isStaffAdmin: boolean;
  canHire: boolean;
}

function getOfferBadge(status: OfferStatus) {
  switch (status) {
    case OfferStatus.DRAFT:
      return <Badge variant="secondary">Draft Offer</Badge>;
    case OfferStatus.EXTENDED:
      return <Badge variant="warning">Offer Extended (Awaiting Decision)</Badge>;
    case OfferStatus.ACCEPTED:
      return <Badge variant="success">Offer Accepted</Badge>;
    case OfferStatus.DECLINED:
      return <Badge variant="destructive">Offer Declined</Badge>;
    case OfferStatus.REVOKED:
      return <Badge variant="outline">Offer Revoked</Badge>;
    case OfferStatus.EXPIRED:
      return <Badge variant="outline">Offer Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

const UNEXPECTED_ERROR = "Something went wrong. Please check your connection and try again.";

export function JobOfferCard({ offer, isStaffAdmin, canHire }: JobOfferCardProps) {
  // An exited record is reused when the person re-joins; any other record blocks joining.
  const existingRecord = offer.candidateEmployment ?? null;
  const rejoinCode = existingRecord?.status === EmployeeStatus.EXITED ? existingRecord.employeeCode : null;
  const blockedByActiveRecord = existingRecord !== null && rejoinCode === null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHireModal, setShowHireModal] = useState(false);

  const handleExtend = async () => {
    if (!confirm("Are you sure you want to formally extend this offer to the candidate?")) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await extendJobOfferAction(offer.id);
      if (!res.success) {
        setError(res.error);
      }
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    const reason = prompt("Enter reason for revoking offer:");
    if (reason === null) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await revokeJobOfferAction(offer.id, reason);
      if (!res.success) {
        setError(res.error);
      }
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" /> Full-Time Job Offer
              </CardTitle>
            </div>
            {getOfferBadge(offer.status)}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4 text-xs">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/30 border border-border/40">
            <div>
              <div className="text-muted-foreground text-[11px]">Designation & Dept</div>
              <div className="font-semibold text-foreground text-sm mt-0.5">
                {offer.designation}
              </div>
              <div className="text-muted-foreground">{offer.department}</div>
            </div>

            <div>
              <div className="text-muted-foreground text-[11px] flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Expected Joining Date
              </div>
              <div className="font-semibold text-foreground text-sm mt-0.5">
                {new Date(offer.expectedJoiningDate).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              {offer.location && (
                <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" /> {offer.location}
                </div>
              )}
            </div>

            <div>
              <div className="text-muted-foreground text-[11px]">Status Tracking</div>
              {offer.extendedAt && (
                <div className="text-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3 text-warning" /> Extended:{" "}
                  {new Date(offer.extendedAt).toLocaleDateString()}
                </div>
              )}
              {offer.decisionAt && (
                <div className="text-foreground mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" /> Decision:{" "}
                  {new Date(offer.decisionAt).toLocaleDateString()}
                </div>
              )}
              {offer.declineReason && (
                <div className="text-destructive mt-0.5 italic">
                  {offer.status === OfferStatus.REVOKED ? "Revocation reason (internal)" : "Decline reason"}:{" "}
                  {offer.declineReason}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="font-medium text-foreground mb-1">Agreed Terms Summary:</div>
            <div className="p-3 rounded-md bg-card border border-border/60 text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {offer.termsSummary}
            </div>
          </div>

          {offer.notes && isStaffAdmin && (
            <div className="p-2.5 rounded bg-muted/50 border border-border/40 text-[11px]">
              <span className="font-semibold text-warning block mb-0.5">
                Confidential Staff Notes:
              </span>
              {offer.notes}
            </div>
          )}

          {offer.signature ? (
            <section
              aria-labelledby={`offer-signature-${offer.id}`}
              className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-3"
            >
              <h3
                id={`offer-signature-${offer.id}`}
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <PenLine className="h-4 w-4 text-success" aria-hidden="true" /> Electronic acceptance
              </h3>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Signed as</dt>
                  <dd className="font-semibold text-foreground">{offer.signature.signedName}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Signed at</dt>
                  <dd className="font-semibold text-foreground">
                    <time dateTime={new Date(offer.signature.signedAt).toISOString()} suppressHydrationWarning>
                      {new Date(offer.signature.signedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Accepted letter (SHA-256)</dt>
                  <dd className="font-mono text-[11px] text-foreground break-all">{offer.signature.documentHash}</dd>
                  {offer.signature.documentMatches === true && (
                    <dd className="mt-1 flex items-center gap-1 text-success">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> The letter generated now matches the
                      accepted document.
                    </dd>
                  )}
                  {offer.signature.documentMatches === false && (
                    <dd className="mt-1 flex items-center gap-1 text-warning">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> The letter generated now differs from
                      the accepted document (for example, the candidate&apos;s account name changed). The hash above
                      identifies what was accepted.
                    </dd>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Browser</dt>
                  <dd className="text-foreground break-words">{offer.signature.userAgent || "Not recorded"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Network address</dt>
                  <dd className="text-foreground">
                    {offer.signature.ipHashRecorded
                      ? "Recorded as a one-way keyed hash (the address itself is not stored)."
                      : "Not recorded"}
                  </dd>
                </div>
              </dl>
            </section>
          ) : (
            offer.status === OfferStatus.ACCEPTED && (
              <p className="text-[11px] text-muted-foreground">
                This offer was accepted before electronic signatures were recorded, so no signature evidence is
                available.
              </p>
            )
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3">
            <p className="text-muted-foreground">
              {offer.status === OfferStatus.DRAFT
                ? "Preview the letter the candidate will receive once the offer is extended."
                : offer.signature
                  ? "The offer letter with the candidate's electronic acceptance."
                  : "The offer letter as issued to the candidate."}
            </p>
            <a href={offerLetterDownloadPath(offer.id)} className={linkButtonClass("outline", "sm", "shrink-0")}>
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              {offer.status === OfferStatus.DRAFT ? "Preview offer letter" : "Download offer letter"}
            </a>
          </div>
        </CardContent>

        {isStaffAdmin && (
          <CardFooter className="pt-2 border-t border-border/50 flex flex-wrap justify-between gap-2">
            <div>
              {offer.status === OfferStatus.DRAFT && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExtend}
                  disabled={isSubmitting}
                  className="gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" /> Extend Formal Offer to Candidate
                </Button>
              )}

              {offer.status === OfferStatus.ACCEPTED && canHire && !blockedByActiveRecord && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowHireModal(true)}
                  className="gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                  {rejoinCode ? "Mark as re-joined" : "Mark as joined"}
                </Button>
              )}
              {offer.status === OfferStatus.ACCEPTED && canHire && blockedByActiveRecord && existingRecord && (
                <p className="text-xs text-muted-foreground">
                  {offer.candidateName} already has a current employee record ({existingRecord.employeeCode},{" "}
                  {existingRecord.status}). Record their exit before marking a new joining.
                </p>
              )}
            </div>

            {(offer.status === OfferStatus.DRAFT || offer.status === OfferStatus.EXTENDED) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevoke}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" /> Revoke Offer
              </Button>
            )}
          </CardFooter>
        )}
      </Card>

      {showHireModal && (
        <HireEmployeeModal
          applicationId={offer.applicationId}
          candidateName={offer.candidateName}
          defaultDepartment={offer.department}
          defaultDesignation={offer.designation}
          defaultJoiningDate={joiningDatePrefill(offer.expectedJoiningDate)}
          existingEmployeeCode={rejoinCode}
          onClose={() => setShowHireModal(false)}
        />
      )}
    </>
  );
}
