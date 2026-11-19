import React from "react";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import type { PayrollPageData } from "../services/payroll-page-data";
import type { PayrollTab } from "../types";
import { PayrollManagementClient } from "./payroll-management-client";
import { MyPayrollPanel } from "./my-payroll-panel";
import { PayrollStatsCards } from "./payroll-stats-cards";

/** Renders the result of `loadPayrollPageData`; the staff summary cards render on the server. */
export function PayrollPageView({
  pageData,
  initialTab,
  basePath,
}: {
  pageData: PayrollPageData;
  initialTab?: PayrollTab;
  basePath: string;
}) {
  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }
  if (pageData.view === "self") {
    return <MyPayrollPanel overview={pageData.overview} basePath={basePath} />;
  }
  return (
    <div className="w-full">
      <PayrollManagementClient
        initialData={pageData.data}
        initialTab={initialTab}
        statsSlot={<PayrollStatsCards stats={pageData.data.stats} activePeriod={pageData.data.activePeriod} />}
      />
    </div>
  );
}
