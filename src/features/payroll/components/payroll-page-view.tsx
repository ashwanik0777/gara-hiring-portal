import React from "react";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import type { PayrollPageData } from "../services/payroll-page-data";
import { PayrollManagementClient } from "./payroll-management-client";
import { MyPayrollPanel } from "./my-payroll-panel";

/** Renders the result of `loadPayrollPageData`. */
export function PayrollPageView({ pageData }: { pageData: PayrollPageData }) {
  if (pageData.view === "forbidden") {
    return <UnauthorizedState message={pageData.message} />;
  }
  if (pageData.view === "self") {
    return <MyPayrollPanel overview={pageData.overview} />;
  }
  return (
    <div className="w-full">
      <PayrollManagementClient
        key={pageData.data.activePeriod?.id ?? "no-period"}
        initialData={pageData.data}
      />
    </div>
  );
}
