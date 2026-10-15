"use client";

import React, { useState } from "react";
import { OfferStatus, JobOfferDetail } from "../types";
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
} from "lucide-react";
import { HireEmployeeModal } from "./hire-employee-modal";

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

export function JobOfferCard({ offer, isStaffAdmin, canHire }: JobOfferCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHireModal, setShowHireModal] = useState(false);

  const handleExtend = async () => {
    if (!confirm("Are you sure you want to formally extend this offer to the candidate?")) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await extendJobOfferAction(offer.id, offer.applicationId);
      if (!res.success) {
        setError(res.error);
      }
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
      const res = await revokeJobOfferAction(offer.id, offer.applicationId, reason);
      if (!res.success) {
        setError(res.error);
      }
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
            <div className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
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
                  Reason: {offer.declineReason}
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

              {offer.status === OfferStatus.ACCEPTED && canHire && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowHireModal(true)}
                  className="gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Hire & Create Employee Record
                </Button>
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
          defaultJoiningDate={new Date(offer.expectedJoiningDate).toISOString().split("T")[0]}
          onClose={() => setShowHireModal(false)}
        />
      )}
    </>
  );
}
