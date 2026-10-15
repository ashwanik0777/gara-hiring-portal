"use client";

import React, { useState } from "react";
import { scheduleInterviewAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Calendar, AlertCircle, CheckCircle2 } from "lucide-react";

interface InterviewSchedulerFormProps {
  applicationId: string;
  candidateName: string;
  defaultRoundNumber?: number;
}

export function InterviewSchedulerForm({
  applicationId,
  candidateName,
  defaultRoundNumber = 1,
}: InterviewSchedulerFormProps) {
  const [roundNumber, setRoundNumber] = useState(defaultRoundNumber);
  const [roundName, setRoundName] = useState(
    defaultRoundNumber === 1 ? "Technical Evaluation" : `Interview Round ${defaultRoundNumber}`
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [meetingLink, setMeetingLink] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!scheduledAt) {
      setError("Please select a scheduled date and time.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("roundNumber", String(roundNumber));
    formData.append("roundName", roundName);
    formData.append("scheduledAt", new Date(scheduledAt).toISOString());
    formData.append("durationMinutes", String(durationMinutes));
    formData.append("meetingLink", meetingLink);

    try {
      const res = await scheduleInterviewAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSuccess(`Interview "${roundName}" scheduled successfully.`);
        setMeetingLink("");
      }
    } catch {
      setError("Failed to schedule interview. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" /> Schedule Interview: {candidateName}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Round Number
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={roundNumber}
                onChange={(e) => setRoundNumber(Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Round Name
              </label>
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="e.g. System Design / Coding / Cultural Fit"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Date & Time (Local / Time-Zone Safe)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Duration (Minutes)
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
                <option value={90}>90 Minutes</option>
              </select>
            </div>
          </div>

          <Input
            label="Video Conference Meeting Link (Google Meet / Zoom)"
            type="url"
            placeholder="https://meet.google.com/xyz-abcd-efg"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
          />
        </CardContent>
        <CardFooter className="py-3 border-t border-border/50 flex justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            Schedule Interview Round
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
