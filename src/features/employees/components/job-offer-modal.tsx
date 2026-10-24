"use client";

import React, { useState } from "react";
import { createJobOfferAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Briefcase, AlertCircle, X, ShieldAlert } from "lucide-react";

interface JobOfferModalProps {
  applicationId: string;
  candidateName: string;
  defaultDepartment?: string;
  defaultDesignation?: string;
  onClose: () => void;
}

export function JobOfferModal({
  applicationId,
  candidateName,
  defaultDepartment = "",
  defaultDesignation = "",
  onClose,
}: JobOfferModalProps) {
  const [department, setDepartment] = useState(defaultDepartment);
  const [designation, setDesignation] = useState(defaultDesignation);
  const [expectedJoiningDate, setExpectedJoiningDate] = useState("");
  // No pre-filled location or terms: offer terms must come from the approved offer (OD-020).
  const [location, setLocation] = useState("");
  const [termsSummary, setTermsSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("department", department);
    formData.append("designation", designation);
    formData.append("expectedJoiningDate", expectedJoiningDate);
    formData.append("location", location);
    formData.append("termsSummary", termsSummary);
    formData.append("notes", notes);

    try {
      const res = await createJobOfferAction(formData);
      if (!res.success) {
        const details = Object.values(res.fieldErrors ?? {});
        setError(details.length > 0 ? `${res.error}: ${details.join(" ")}` : res.error);
      } else {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="border-border shadow-lg max-w-xl w-full my-8">
        <form onSubmit={handleSubmit}>
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" /> Prepare Job Offer: {candidateName}
                </CardTitle>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-2.5 rounded bg-muted/40 border border-border/40 text-[11px] text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
              <span>
                Non-negotiable policy (OD-007 / OD-008): Only agreed terms summary is recorded. Do not fabricate statutory deduction or salary formulas without approved company policy.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Department <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Engineering, Product"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Designation <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Software Engineer, Product Analyst"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Expected Joining Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={expectedJoiningDate}
                  onChange={(e) => setExpectedJoiningDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Work Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Leave blank if not specified"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-foreground mb-1">
                Agreed Terms Summary <span className="text-destructive">*</span>
              </label>
              <textarea
                rows={4}
                required
                value={termsSummary}
                onChange={(e) => setTermsSummary(e.target.value)}
                placeholder="Summary of the terms agreed with the candidate (as approved)"
                className="w-full px-3 py-2 rounded-md border border-input bg-background resize-y"
              />
            </div>

            <div>
              <label className="block font-medium text-foreground mb-1">
                Confidential Staff Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal interview panel context, hiring approvals..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background resize-y"
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2 border-t border-border/50 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating Draft..." : "Create Draft Offer"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
