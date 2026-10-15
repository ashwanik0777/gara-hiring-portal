"use client";

import React, { useState } from "react";
import { OnboardingChecklistItem } from "../types";
import { updateEmployeeChecklistAction } from "../actions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckSquare, Square, CheckCircle2 } from "lucide-react";

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

  const handleToggle = async (item: OnboardingChecklistItem) => {
    if (!canEdit) return;
    const nextState = !item.completed;
    setLoadingId(item.id);

    try {
      const res = await updateEmployeeChecklistAction(employeeId, item.id, nextState);
      if (res.success) {
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
    } finally {
      setLoadingId(null);
    }
  };

  const completedCount = items.filter((i) => i.completed).length;

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Onboarding Checklist ({completedCount}/{items.length})
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => handleToggle(item)}
            className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
              canEdit ? "cursor-pointer hover:bg-muted/40" : ""
            } ${
              item.completed
                ? "bg-success/5 border-success/30 text-foreground"
                : "bg-card border-border/60 text-muted-foreground"
            }`}
          >
            <button
              type="button"
              disabled={!canEdit || loadingId === item.id}
              className="mt-0.5 text-primary shrink-0 focus:outline-hidden"
            >
              {item.completed ? (
                <CheckSquare className="h-4 w-4 text-success" />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <div className="flex-1">
              <span className={`font-medium ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.label}
              </span>
              {item.completedAt && (
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  Verified: {new Date(item.completedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
