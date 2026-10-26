"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportRegistrantsCsvAction } from "../registration-actions";
import type { RegistrantListFilters } from "../types";

function yesNo(value: boolean | null): "" | "yes" | "no" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

/**
 * Downloads the registrants matching the current filters as CSV. The server checks the
 * permission again, caps the rows and records the export in the audit log.
 */
export function RegistrantsExportButton({ filters }: { filters: RegistrantListFilters }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const handleExport = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await exportRegistrantsCsvAction({
          startDate: filters.startDate,
          endDate: filters.endDate,
          interest: filters.interest ?? "",
          emailVerified: yesNo(filters.emailVerified),
          applied: yesNo(filters.applied),
          search: filters.search ?? "",
        });
        if (!response.success) {
          setMessage({ tone: "error", text: response.error.message });
          return;
        }
        const { fileName, csvContent, rowCount, truncated } = response.data;
        const url = URL.createObjectURL(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setMessage({
          tone: "success",
          text: truncated
            ? `Downloaded ${fileName} with the first ${rowCount} rows. Narrow the filters to export the rest.`
            : `Downloaded ${fileName} (${rowCount} rows).`,
        });
      } catch {
        setMessage({
          tone: "error",
          text: "We couldn't reach the server. Check your connection and try again.",
        });
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button type="button" size="sm" variant="outline" onClick={handleExport} isLoading={isPending}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Export CSV
      </Button>
      <p
        aria-live="polite"
        className={`text-[11px] ${message?.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {message?.text ?? ""}
      </p>
    </div>
  );
}
