"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { exportHiringFunnelCsvAction } from "../actions";
import type { HiringFunnelFilters } from "../types";

/** Downloads the funnel as CSV for the filters currently shown (audited on the server). */
export function FunnelExportButton({ filters }: { filters: HiringFunnelFilters }) {
  const [isPending, startTransition] = useTransition();

  const handleExport = () => {
    startTransition(async () => {
      try {
        const response = await exportHiringFunnelCsvAction({
          startDate: filters.startDate ?? "",
          endDate: filters.endDate ?? "",
          openingType: filters.openingType ?? "",
          openingId: filters.openingId ?? "",
        });
        if (!response.success) {
          toast.error(response.error.message);
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
        toast.success(`Downloaded ${fileName} (${rowCount} rows).`);
      } catch {
        toast.error("We couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleExport} isLoading={isPending}>
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Export funnel CSV
    </Button>
  );
}
