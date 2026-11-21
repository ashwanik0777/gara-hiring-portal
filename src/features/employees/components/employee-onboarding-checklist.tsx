"use client";

import React, { useState } from "react";
import { OnboardingChecklistItem } from "../types";
import { updateEmployeeChecklistAction } from "../actions";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBatchDayTime } from "@/features/training/components/batch-dates";
import { EmployeeSectionCard } from "./employee-section-card";

interface EmployeeOnboardingChecklistProps {
  employeeId: string;
  checklist: OnboardingChecklistItem[];
  canEdit: boolean;
}

export function EmployeeOnboardingChecklist({
  employeeId,
  checklist,
  canEdit,
}: EmployeeOnboardingChecklistProps) {
  const [items, setItems] = useState<OnboardingChecklistItem[]>(checklist);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (item: OnboardingChecklistItem) => {
    if (!canEdit) return;
    const nextState = !item.completed;
    setLoadingId(item.id);
    setError(null);

    try {
      const res = await updateEmployeeChecklistAction(employeeId, item.id, nextState);
      if (!res.success) {
        setError(res.error);
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  completed: nextState,
                  completedAt: nextState ? new Date().toISOString() : null,
                }
              : i
          )
        );
      }
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoadingId(null);
    }
  };

  const completedCount = items.filter((i) => i.completed).length;
  const percent = items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100);

  return (
    <EmployeeSectionCard
      title="Onboarding"
      icon={CheckCircle2}
      action={
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {completedCount}/{items.length} done
        </span>
      }
    >
      <div className="space-y-4">
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15"
        >
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        {error && (
          <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-primary",
                  canEdit && "cursor-pointer hover:bg-muted/40",
                  item.completed ? "border-success/30 bg-success/5" : "border-border/60 bg-card"
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"
                  checked={item.completed}
                  disabled={!canEdit || loadingId === item.id}
                  onChange={() => handleToggle(item)}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("font-medium", item.completed ? "text-muted-foreground line-through" : "text-foreground")}>{item.label}</span>
                  {item.completedAt && <span className="mt-0.5 block text-xs text-muted-foreground">Done {formatBatchDayTime(new Date(item.completedAt))}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </EmployeeSectionCard>
  );
}
