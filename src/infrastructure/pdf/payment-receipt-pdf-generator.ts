import { COLOR, LetterLayout, MARGIN_X, TOP, finishLetterDocument, formatLetterDay } from "./offer-letter-pdf-generator";
import { toWinAnsi } from "./pdf-text";

/**
 * "Payment Receipt" for Industrial Training (A4 portrait). The company is not GST registered
 * (product owner, 2026-11-19): the document is never called a tax invoice and carries no GST
 * line or GSTIN. Pure function of the payload.
 */
export interface PaymentReceiptPayload {
  receiptNo: string;
  paidAt: Date;
  timeZone: string;
  companyName: string;
  /** Statutory and address lines under the letterhead (only confirmed values). */
  companyLines: string[];
  studentName: string;
  studentEmail: string;
  programTitle: string;
  batchName: string;
  /** Pre-formatted rupee amounts, e.g. "₹4,999" (shown as "Rs." in the PDF font). */
  listPrice: string;
  discount: string | null;
  amountPaid: string;
  paymentReference: string;
  contactEmail: string;
}

/** Standard PDF fonts have no rupee glyph; "Rs." is the plain-text form. */
function pdfAmount(amount: string): string {
  return amount.replace(/₹\s?/g, "Rs. ");
}

export function buildPaymentReceiptPdf(payload: PaymentReceiptPayload): Buffer {
  const layout = new LetterLayout();

  layout.drawText(MARGIN_X, TOP - 12, "bold", 12, COLOR.ink, toWinAnsi(payload.companyName));
  layout.rule(TOP - 22, COLOR.accent, 1.2);
  payload.companyLines.slice(0, 2).forEach((line, index) => {
    layout.drawText(MARGIN_X, TOP - 33 - index * 10, "regular", 8, COLOR.muted, toWinAnsi(line));
  });
  layout.drawText(MARGIN_X, TOP - 58, "bold", 22, COLOR.ink, toWinAnsi("Payment Receipt"));
  layout.drawText(MARGIN_X, TOP - 80, "regular", 10, COLOR.muted, toWinAnsi(`Receipt no.: ${payload.receiptNo}`));
  layout.drawText(MARGIN_X, TOP - 94, "regular", 10, COLOR.muted, toWinAnsi(`Date: ${formatLetterDay(payload.paidAt, payload.timeZone)}`));
  layout.y = TOP - 104;

  layout.gap(26);
  layout.drawText(MARGIN_X, layout.y, "regular", 9, COLOR.muted, toWinAnsi("Received from"));
  layout.paragraph(payload.studentName, { font: "bold", size: 14, leading: 18, color: COLOR.ink });
  layout.paragraph(payload.studentEmail, { font: "regular", size: 10, leading: 14, color: COLOR.muted });

  layout.gap(10);
  layout.rule(layout.y, COLOR.rule, 0.6);
  layout.detailRow("Programme", `Industrial Training: ${payload.programTitle}`);
  layout.detailRow("Batch", payload.batchName);
  layout.detailRow("Fee", pdfAmount(payload.listPrice));
  if (payload.discount) layout.detailRow("Discount", pdfAmount(payload.discount));
  layout.detailRow("Amount paid", pdfAmount(payload.amountPaid));
  layout.detailRow("Payment reference", payload.paymentReference);
  layout.detailRow("Paid through", "Razorpay");

  layout.gap(14);
  layout.paragraph("The fee covers the training and mentorship; the digital certificate is included.", {
    font: "regular",
    size: 10.5,
    leading: 15,
    color: COLOR.ink,
  });
  layout.gap(6);
  layout.paragraph(`Refunds and transfers follow the Refund & Cancellation Policy. Questions: ${payload.contactEmail}`, {
    font: "regular",
    size: 10,
    leading: 14,
    color: COLOR.muted,
  });
  layout.gap(6);
  layout.paragraph("This is a computer-generated receipt and needs no signature.", {
    font: "regular",
    size: 9,
    leading: 13,
    color: COLOR.muted,
  });

  return finishLetterDocument(layout, {
    title: `Payment Receipt ${payload.receiptNo}`,
    footer: (page, count) => `Payment Receipt ${payload.receiptNo} · Page ${page} of ${count}`,
  });
}
