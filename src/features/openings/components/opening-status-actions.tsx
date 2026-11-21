"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { OpeningStatus } from "@/types/enums";
import { updateOpeningStatusAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, PauseCircle, XCircle } from "lucide-react";

interface OpeningStatusActionsProps {
  openingId: string;
  currentStatus: OpeningStatus;
}

export function OpeningStatusActions({ openingId, currentStatus }: OpeningStatusActionsProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleStatusChange = async (newStatus: OpeningStatus) => {
    setIsUpdating(true);
    setError(null);
    try {
      const res = await updateOpeningStatusAction(openingId, newStatus);
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("An unexpected error occurred while updating status.");
    } finally {
      setIsUpdating(false);
    }
  };

  const statusVariants: Record<string, "default" | "secondary" | "warning" | "destructive" | "outline"> = {
    DRAFT: "secondary",
    PUBLISHED: "default",
    PAUSED: "warning",
    CLOSED: "destructive",
  };

  const statusLabels: Record<string, string> = {
    DRAFT: "Draft",
    PUBLISHED: "Published",
    PAUSED: "Paused",
    CLOSED: "Closed",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Current status:</span>
        <Badge variant={statusVariants[currentStatus] ?? "secondary"} className="text-xs">
          {statusLabels[currentStatus] ?? currentStatus}
        </Badge>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive p-2 rounded-lg bg-destructive/10 border border-destructive/20">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {currentStatus === OpeningStatus.DRAFT && (
          <Button
            size="sm"
            isLoading={isUpdating}
            className="gap-1.5"
            onClick={() => handleStatusChange(OpeningStatus.PUBLISHED)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Publish Vacancy Live
          </Button>
        )}

        {currentStatus === OpeningStatus.PUBLISHED && (
          <>
            <Button
              variant="outline"
              size="sm"
              isLoading={isUpdating}
              className="gap-1.5 text-warning border-warning/40 hover:bg-warning/10"
              onClick={() => handleStatusChange(OpeningStatus.PAUSED)}
            >
              <PauseCircle className="h-3.5 w-3.5" />
              Pause Applications
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={isUpdating}
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => handleStatusChange(OpeningStatus.CLOSED)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Close Vacancy Permanently
            </Button>
          </>
        )}

        {currentStatus === OpeningStatus.PAUSED && (
          <>
            <Button
              size="sm"
              isLoading={isUpdating}
              className="gap-1.5"
              onClick={() => handleStatusChange(OpeningStatus.PUBLISHED)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resume Publishing
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={isUpdating}
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => handleStatusChange(OpeningStatus.CLOSED)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Close Vacancy
            </Button>
          </>
        )}

        {currentStatus === OpeningStatus.CLOSED && (
          <p className="text-xs text-muted-foreground">
            This opening is closed for good and no longer accepts applications.
          </p>
        )}
      </div>
    </div>
  );
}
