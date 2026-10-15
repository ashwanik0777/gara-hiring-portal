"use client";

import React, { useState } from "react";
import { InterviewRecommendation } from "@prisma/client";
import { submitFeedbackAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, FileCheck, ShieldAlert } from "lucide-react";

interface InterviewFeedbackFormProps {
  scheduleId: string;
  roundName: string;
  candidateName: string;
  existingFeedback?: {
    recommendation: InterviewRecommendation;
    summaryNotes: string;
    ratings: Record<string, unknown>;
  } | null;
}

export function InterviewFeedbackForm({
  scheduleId,
  roundName,
  candidateName,
  existingFeedback,
}: InterviewFeedbackFormProps) {
  const [recommendation, setRecommendation] = useState<InterviewRecommendation>(
    existingFeedback?.recommendation ?? InterviewRecommendation.HIRE
  );
  const [technical, setTechnical] = useState(
    Number(existingFeedback?.ratings?.technical ?? 4)
  );
  const [problemSolving, setProblemSolving] = useState(
    Number(existingFeedback?.ratings?.problemSolving ?? 4)
  );
  const [communication, setCommunication] = useState(
    Number(existingFeedback?.ratings?.communication ?? 4)
  );
  const [summaryNotes, setSummaryNotes] = useState(
    existingFeedback?.summaryNotes ?? ""
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (summaryNotes.trim().length < 5) {
      setError("Please provide detailed summary notes (at least 5 characters).");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("scheduleId", scheduleId);
    formData.append("recommendation", recommendation);
    formData.append("summaryNotes", summaryNotes);
    formData.append(
      "ratings",
      JSON.stringify({
        technical,
        problemSolving,
        communication,
      })
    );

    try {
      const res = await submitFeedbackAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSuccess("Interviewer evaluation & recommendation submitted successfully.");
      }
    } catch {
      setError("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-primary" /> Interview Evaluation: {candidateName}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {roundName}
          </span>
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

          {/* Ratings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/20 border border-border/50 rounded-lg">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground">
                Technical Mastery (1-5)
              </label>
              <select
                value={technical}
                onChange={(e) => setTechnical(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground"
              >
                {[1, 2, 3, 4, 5].map((score) => (
                  <option key={score} value={score}>
                    {score} / 5
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground">
                Problem Solving (1-5)
              </label>
              <select
                value={problemSolving}
                onChange={(e) => setProblemSolving(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground"
              >
                {[1, 2, 3, 4, 5].map((score) => (
                  <option key={score} value={score}>
                    {score} / 5
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground">
                Communication (1-5)
              </label>
              <select
                value={communication}
                onChange={(e) => setCommunication(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground"
              >
                {[1, 2, 3, 4, 5].map((score) => (
                  <option key={score} value={score}>
                    {score} / 5
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Advisory Recommendation */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Interviewer Recommendation (Advisory) <span className="text-destructive">*</span>
            </label>
            <select
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value as InterviewRecommendation)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              <option value={InterviewRecommendation.STRONG_HIRE}>Strong Hire — Highly Recommended</option>
              <option value={InterviewRecommendation.HIRE}>Hire — Recommended</option>
              <option value={InterviewRecommendation.HOLD}>Hold — Potential fit / Needs second review</option>
              <option value={InterviewRecommendation.NO_HIRE}>No Hire — Does not meet current requirements</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Note: This recommendation is recorded as interviewer advisory feedback. The hiring manager or authorized HR makes the final decision.
            </p>
          </div>

          {/* Evaluation Summary Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground flex items-center justify-between">
              <span>Confidential Evaluation Summary <span className="text-destructive">*</span></span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-warning" /> Confidential to hiring team
              </span>
            </label>
            <textarea
              rows={4}
              required
              value={summaryNotes}
              onChange={(e) => setSummaryNotes(e.target.value)}
              placeholder="Detail candidate problem solving, code quality, strengths, and areas for improvement..."
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
        <CardFooter className="py-3 border-t border-border/50 flex justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            Submit Interview Assessment
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
