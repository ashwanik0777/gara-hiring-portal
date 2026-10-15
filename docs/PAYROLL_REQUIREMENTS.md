# Payroll Requirements Checklist — GARA Innovation

> **Status:** Requirements & Scope Architecture Document (Pre-Implementation Gate)  
> **Reference Decision:** `OD-008` (Baseline `D-12`)  
> **Mandate:** Zero salary formulas, statutory tax models, or payslip generators may be implemented until this checklist is formally reviewed, completed, and approved by the Product Owner and validated by authorized legal/accounting counsel.

---

## 1. Scope Decision: Records/Export vs. Calculation Engine

The primary architectural decision for the GARA Innovation payroll subsystem must be selected before any computational logic is written:

- [ ] **Option A (Recommended for v1): Payroll Record & External Export Integration**
  - **Scope:** GARA HRMS maintains official employee compensation agreements, attendance summaries, approved unpaid leave days, and disbursement tracking. Calculations are performed by an authorized payroll bureau or certified external payroll provider (e.g., RazorpayX Payroll, Keka, Zoho Payroll). GARA exports monthly payroll input data (loss of pay days, new hires, exits, revisions) and imports finalized disbursement records and payslip documents.
  - **Advantage:** Eliminates compliance liability and regulatory maintenance of changing statutory tax slabs, PF interest updates, and ESI wage ceilings.
- [ ] **Option B: Native Full-Stack Calculation Engine**
  - **Scope:** GARA Innovation develops and maintains an internal calculation engine for basic, HRA, special allowances, statutory deductions, TDS calculation, and PDF payslip generation.
  - **Requirement:** Requires explicit written approval of all mathematical formulas, tax regimes, and formal sign-off from a certified Chartered Accountant or legal counsel.

---

## 2. Salary Components & Pay Structure

- [ ] **Earning Components:**
  - Basic Salary (% of CTC or fixed amount)
  - House Rent Allowance (HRA) (metro vs. non-metro formula)
  - Special / Conveyance / Medical Allowance
  - Performance Bonus / Variable Pay
  - Reimbursements & Expense claims
- [ ] **Pay Frequency & Cycle:**
  - Monthly pay cycle cut-off date (e.g. 25th of month to 24th of next month, or calendar month)
  - Disbursement target date (e.g. last working day of month, 1st or 5th of following month)
- [ ] **Employee Classifications:**
  - Full-time regular staff
  - Probationary employees
  - Interns (stipend vs. salary)
  - Retainers / Consultants (TDS 194J vs. payroll)

---

## 3. Proration & Working-Day Rules

- [ ] **Mid-Month Joining / Exit Proration:**
  - Calculation basis: Calendar days (e.g., actual days in month like 28/30/31) vs. fixed 30 days vs. working days (excluding weekends and official holidays).
- [ ] **Loss of Pay (LOP) & Unpaid Leave:**
  - Unpaid leave day calculation formula.
  - Deductions tied to attendance regularizations or unexcused absences.

---

## 4. Statutory Deductions & Regulatory Compliance (Jurisdiction Specific)

*Note: GARA Innovation does not provide legal advice or invent statutory values. The Product Owner and legal counsel must approve applicable rules.*

- [ ] **Provident Fund (PF / EPF):**
  - Applicable wage ceiling (e.g., ₹15,000 statutory cap vs. full basic).
  - Employee contribution percentage (standard 12%).
  - Employer contribution matching (12% split between EPF and EPS).
  - PF Admin and EDLI charges handling.
  - Voluntary PF (VPF) support.
- [ ] **Employee State Insurance (ESI):**
  - Wage ceiling applicability (e.g., ₹21,000 gross).
  - Employee contribution rate (0.75%).
  - Employer contribution rate (3.25%).
- [ ] **Tax Deducted at Source (TDS / Income Tax):**
  - Old Tax Regime vs. New Tax Regime declaration support.
  - Proof of investment submission (Section 80C, 80D, HRA receipts).
  - Standard deduction rules.
- [ ] **Professional Tax (PT):**
  - State-specific slabs (e.g., Karnataka, Maharashtra, etc.).

---

## 5. Adjustments, Approvals & Workflow Governance

- [ ] **Pre-Payroll Approval Flow:**
  - HR Manager prepares monthly draft run.
  - Finance / Program Director reviews payroll input summary.
  - Managing Director / Executive authorizes fund disbursement.
- [ ] **One-off Adjustments:**
  - Arrears tracking (retroactive salary increments).
  - Ad-hoc bonuses and advances.
  - Loan or equipment deduction recovery.
- [ ] **Correction & Reversal Process:**
  - Procedure for salary adjustments when errors are identified post-disbursement.
  - Immutable audit trail of adjustments with mandatory remarks and approver IDs.

---

## 6. Access Control & Confidentiality Matrix

- [ ] **Strict RBAC Data Isolation:**
  - Candidate: **NO ACCESS**
  - Intern: **NO ACCESS**
  - Interviewer / Mentor: **NO ACCESS**
  - Manager: Access restricted to salary change recommendations for direct reports; cannot view peers or superiors.
  - Employee: Self payslip view only. Cannot access bank accounts or salary figures of any colleague.
  - HR & Admin: Full administrative and disbursement tracking access.
- [ ] **Audit Trail:**
  - Every payroll period creation, record generation, salary adjustment, and payout marking must record actor, timestamp, IP, and diff payload.

---

## 7. Sign-Off & Verification Gate

| Reviewer Role | Name / Title | Decision / Date | Signature |
|---|---|---|---|
| Product Owner | | [ ] Approved / [ ] Changes Requested | |
| HR Operations Lead | | [ ] Approved / [ ] Changes Requested | |
| Legal / Accounting Advisor | | [ ] Approved / [ ] Changes Requested | |
