"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportHiringFunnelCsvAction } from "../actions";
import type { HiringFunnelFilters } from "../types";

/** Downloads the funnel as CSV for the filters currently shown (audited on the server). */
export function FunnelExportButton({ filters }: { filters: HiringFunnelFilters }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const handleExport = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await exportHiringFunnelCsvAction({
          startDate: filters.startDate ?? "",
          endDate: filters.endDate ?? "",
          openingType: filters.openingType ?? "",
          openingId: filters.openingId ?? "",
        });
        if (!response.success) {
          setMessage({ tone: "error", text: response.error.message });
          return;
        }
        const { fileName, csvContent, rowCount } = response.data;
        const url = URL.createObjectURL(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setMessage({ tone: "success", text: `Downloaded ${fileName} (${rowCount} rows).` });
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
        Export funnel CSV
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
