/**
 * Pure payroll formatting helpers shared by the server (register CSV) and the UI.
 */

import type { EmploymentCategory } from "./types";

export const NOT_CONFIGURED = "Not configured";

export function employmentLabel(type: EmploymentCategory | null): string {
  if (type === "INTERN") return "Intern";
  if (type === "FULL_TIME") return "Full-Time";
  return "Type not configured";
}

/** Neutralises spreadsheet formula injection and quotes a CSV cell. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

/** One register row as exported: identifiers are already masked. */
export interface PayrollRegisterCsvRow {
  employeeCode: string;
  employeeName: string;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  ifscCode: string | null;
  stipendAmount: number | null;
  employmentType: EmploymentCategory | null;
  disbursementReference: string | null;
  status: string;
}

const REGISTER_HEADERS = [
  "Employee Code",
  "Employee Name",
  "Account Holder",
  "Bank",
  "Account Number (masked)",
  "IFSC Code",
  "Configured Amount",
  "Employment Type",
  "Reference",
  "Status",
];

/** Register CSV. A bank upload file format is pending approval (OD-008). */
export function buildPayrollRegisterCsv(rows: readonly PayrollRegisterCsvRow[]): string {
  const lines = rows.map((r) =>
    [
      csvCell(r.employeeCode),
      csvCell(r.employeeName),
      csvCell(r.accountHolderName ?? NOT_CONFIGURED),
      csvCell(r.bankName ?? NOT_CONFIGURED),
      csvCell(r.accountNumberMasked ?? NOT_CONFIGURED),
      csvCell(r.ifscCode ?? NOT_CONFIGURED),
      csvCell(typeof r.stipendAmount === "number" ? r.stipendAmount : NOT_CONFIGURED),
      csvCell(employmentLabel(r.employmentType)),
      csvCell(r.disbursementReference ?? ""),
      csvCell(r.status),
    ].join(",")
  );
  return [REGISTER_HEADERS.map(csvCell).join(","), ...lines].join("\n");
}
