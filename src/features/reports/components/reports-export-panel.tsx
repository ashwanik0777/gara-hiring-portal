"use client";

import { useState, useTransition } from "react";
import { exportReportCsvAction } from "../actions";
import { ReportType } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Download, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";

export function ReportsExportPanel({
  filters,
}: {
  filters: {
    startDate: string | null;
    endDate: string | null;
    department: string | null;
    openingId: string | null;
  };
}) {
  const [isPending, startTransition] = useTransition();
  const [lastExportMessage, setLastExportMessage] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleExport(reportType: ReportType) {
    setErrorMessage(null);
    setLastExportMessage(null);

    startTransition(async () => {
      const response = await exportReportCsvAction({
        reportType,
        startDate: filters.startDate ?? undefined,
        endDate: filters.endDate ?? undefined,
        department: filters.department ?? undefined,
        openingId: filters.openingId ?? undefined,
      });

      if (!response.success) {
        setErrorMessage(response.error.message);
        return;
      }

      const { fileName, csvContent, rowCount } = response.data;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setLastExportMessage(
        `Exported ${fileName} (${rowCount} rows) and recorded EXPORT_REPORT in AuditLog.`
      );
    });
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Audited CSV Report Exports
            </CardTitle>
          </div>
          <Badge variant="outline" className="text-xs gap-1">
            <ShieldCheck className="h-3 w-3 text-primary" />
            PII-Sanitized & Audited
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleExport("RECRUITMENT_PIPELINE")}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Recruitment Pipeline CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleExport("INTERNSHIP_LIFECYCLE")}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Internship Lifecycle CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleExport("EMPLOYEE_HEADCOUNT")}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Employee Directory CSV
          </Button>
        </div>

        {lastExportMessage && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{lastExportMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
