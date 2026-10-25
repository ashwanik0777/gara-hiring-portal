"use client";

import React, { useState } from "react";
import { triggerEvaluationStartAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Calendar, Play, AlertCircle, CheckCircle2 } from "lucide-react";

interface StartEvaluationDialogProps {
  enrollmentId: string;
  candidateName: string;
  currentStatus: string;
}

export function StartEvaluationDialog({
  enrollmentId,
  candidateName,
  currentStatus,
}: StartEvaluationDialogProps) {
  const [startDate, setStartDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (currentStatus !== "PENDING_TRIGGER") {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!startDate) {
      setError("Please select the evaluation start date.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);
    formData.append("startDate", startDate);

    try {
      const res = await triggerEvaluationStartAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSuccess("7-working-day evaluation window initiated successfully.");
      }
    } catch {
      setError("We couldn't start the evaluation. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs border-primary/40">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" /> Start Evaluation: {candidateName}
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="pt-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="start-evaluation-dialog-official-start-date" className="block text-xs font-medium text-foreground">
              Official Start Date (Day 1) <span className="text-destructive">*</span>
            </label>
            <input
              id="start-evaluation-dialog-official-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              The 7th working day deadline will automatically be calculated excluding configured non-working days and holidays.
            </p>
          </div>
        </CardContent>
        <CardFooter className="py-3 border-t border-border/50 flex justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            <Calendar className="h-3.5 w-3.5 mr-1.5" /> Start 7-Working-Day Window
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
