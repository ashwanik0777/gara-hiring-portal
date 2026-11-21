"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
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

  const handleExport = () => {
    startTransition(async () => {
      try {
        const response = await exportRegistrantsCsvAction({
          startDate: filters.startDate ?? "",
          endDate: filters.endDate ?? "",
          interest: filters.interest ?? "",
          emailVerified: yesNo(filters.emailVerified),
          applied: yesNo(filters.applied),
          search: filters.search ?? "",
        });
        if (!response.success) {
          toast.error(response.error.message);
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
        toast.success(
          truncated
            ? `Downloaded ${fileName} with the first ${rowCount} rows. Narrow the filters to export the rest.`
            : `Downloaded ${fileName} (${rowCount} rows).`
        );
      } catch {
        toast.error("We couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleExport} isLoading={isPending}>
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Export CSV
    </Button>
  );
}
