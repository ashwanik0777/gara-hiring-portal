import { createHash } from "node:crypto";
import { assemblePdfDocument } from "./vector-pdf-builder";
import { escapePdfLiteral, toWinAnsi, wrapText, type StandardFont } from "./pdf-text";
import type { OfferLetterPdfPayload } from "./types";

/**
 * Offer letter PDF (A4 portrait, one to two pages for typical terms).
 *
 * Built only from JobOffer data plus neutral fixed wording: no legal clauses, salary or
 * probation text is ever added (OD-020). The output is a pure function of the payload — no
 * clock, randomness or locale — so the SHA-256 of a letter can be reproduced later from the
 * same offer data.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 64;
const TOP = PAGE_HEIGHT - 64;
/** Lowest baseline for body text; the footer sits below it. */
const BOTTOM = 72;
const FOOTER_Y = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const LABEL_WIDTH = 140;

const COLOR = {
  ink: "0.059 0.090 0.165",
  muted: "0.392 0.455 0.545",
  accent: "0.851 0.467 0.024",
  rule: "0.886 0.910 0.941",
  noteFill: "0.973 0.980 0.988",
  noteStroke: "0.796 0.835 0.882",
  successFill: "0.925 0.992 0.961",
  successStroke: "0.063 0.725 0.506",
  successInk: "0.024 0.373 0.275",
} as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Fixed-precision number formatting so coordinates serialize identically everywhere. */
function num(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function dayLabel(year: number, month: number, day: number): string {
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Calendar day stored at UTC midnight (e.g. the expected joining date). */
function formatCalendarDay(date: Date): string {
  return dayLabel(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  offsetMinutes: number;
}

/** Numeric wall-clock parts of an instant in a time zone (invalid zones fall back to UTC). */
function zonedParts(instant: Date, timeZone: string): ZonedParts {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return zonedParts(instant, "UTC");
  }
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const wholeMinute = Math.floor(instant.getTime() / 60000) * 60000;
  const offsetMinutes = Math.round((Date.UTC(year, month - 1, day, hour, minute) - wholeMinute) / 60000);
  return { year, month, day, hour, minute, offsetMinutes };
}

/** Day of an instant in the given time zone, e.g. "25 October 2026". */
export function formatLetterDay(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return dayLabel(p.year, p.month, p.day);
}

/** "25 October 2026, 14:05 UTC+05:30" — the offset is computed, never a locale abbreviation. */
export function formatLetterDateTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const sign = p.offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(p.offsetMinutes);
  const offset = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const time = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  return `${dayLabel(p.year, p.month, p.day)}, ${time} ${offset}`;
}

/** Collects drawing operators page by page and keeps the text cursor. */
class LetterLayout {
  readonly pages: string[][] = [[]];
  /** Baseline of the last line drawn on the current page. */
  y = TOP;

  private get ops(): string[] {
    return this.pages[this.pages.length - 1];
  }

  newPage(): void {
    this.pages.push([]);
    this.y = TOP;
  }

  /** Starts a new page when `height` points no longer fit above the bottom margin. */
  ensure(height: number): void {
    if (this.y - height < BOTTOM) {
      this.newPage();
    }
  }

  gap(height: number): void {
    this.y -= height;
  }

  /** Draws an already converted WinAnsi string at a baseline. */
  drawText(x: number, y: number, font: StandardFont, size: number, color: string, winAnsi: string): void {
    if (!winAnsi) return;
    this.ops.push(
      "BT",
      `/${font === "bold" ? "F2" : "F1"} ${num(size)} Tf`,
      `${color} rg`,
      `${num(x)} ${num(y)} Td`,
      `(${escapePdfLiteral(winAnsi)}) Tj`,
      "ET"
    );
  }

  rule(y: number, color: string, width: number, x1 = MARGIN_X, x2 = PAGE_WIDTH - MARGIN_X): void {
    this.ops.push(`${color} RG`, `${num(width)} w`, `${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`);
  }

  box(x: number, y: number, width: number, height: number, fill: string, stroke: string): void {
    this.ops.push(
      `${fill} rg`,
      `${stroke} RG`,
      "0.8 w",
      `${num(x)} ${num(y)} ${num(width)} ${num(height)} re B`
    );
  }

  /** Wrapped text that flows across pages, one line at a time. */
  paragraph(
    text: string,
    options: { font: StandardFont; size: number; leading: number; color: string; x?: number; width?: number }
  ): void {
    const x = options.x ?? MARGIN_X;
    const lines = wrapText(text, options.font, options.size, options.width ?? CONTENT_WIDTH);
    for (const line of lines) {
      this.ensure(options.leading);
      this.y -= options.leading;
      this.drawText(x, this.y, options.font, options.size, options.color, line);
    }
  }

  /** A shaded box with a bold title and wrapped body lines, kept on one page. */
  callout(title: string, body: string, colors: { fill: string; stroke: string; ink: string }): void {
    const padding = 12;
    const leading = 14;
    const lines = wrapText(body, "regular", 10, CONTENT_WIDTH - padding * 2);
    const height = padding * 2 + 14 + lines.length * leading;
    this.ensure(height + 8);
    const top = this.y - 8;
    this.box(MARGIN_X, top - height, CONTENT_WIDTH, height, colors.fill, colors.stroke);
    let baseline = top - padding - 10;
    this.drawText(MARGIN_X + padding, baseline, "bold", 10.5, colors.ink, toWinAnsi(title));
    for (const line of lines) {
      baseline -= leading;
      this.drawText(MARGIN_X + padding, baseline, "regular", 10, colors.ink, line);
    }
    this.y = top - height;
  }

  /** Label / value row of the offer details table; the row is never split across pages. */
  detailRow(label: string, value: string): void {
    const leading = 15;
    const valueX = MARGIN_X + LABEL_WIDTH + 10;
    const lines = wrapText(value, "bold", 10.5, CONTENT_WIDTH - LABEL_WIDTH - 10);
    const height = lines.length * leading + 8;
    this.ensure(height);
    let baseline = this.y - leading;
    this.drawText(MARGIN_X, baseline, "regular", 10, COLOR.muted, toWinAnsi(label));
    for (const line of lines) {
      this.drawText(valueX, baseline, "bold", 10.5, COLOR.ink, line);
      baseline -= leading;
    }
    this.y -= height;
    this.rule(this.y + 2, COLOR.rule, 0.6);
  }
}

/**
 * Builds the offer letter. The same payload always yields byte-identical output.
 */
export function buildOfferLetterPdf(payload: OfferLetterPdfPayload): Buffer {
  const layout = new LetterLayout();
  const reference = payload.offerReference;

  // Letterhead
  layout.drawText(MARGIN_X, TOP - 12, "bold", 12, COLOR.ink, toWinAnsi("GARA INNOVATION"));
  layout.rule(TOP - 22, COLOR.accent, 1.2);
  layout.drawText(MARGIN_X, TOP - 58, "bold", 22, COLOR.ink, toWinAnsi("Offer letter"));
  layout.drawText(MARGIN_X, TOP - 80, "regular", 10, COLOR.muted, toWinAnsi(`Offer reference: ${reference}`));
  layout.drawText(
    MARGIN_X,
    TOP - 94,
    "regular",
    10,
    COLOR.muted,
    toWinAnsi(`Issue date: ${payload.issuedAt ? formatLetterDay(payload.issuedAt, payload.timeZone) : "Not issued yet"}`)
  );
  layout.y = TOP - 104;

  if (payload.statusNote) {
    layout.callout("Offer status", payload.statusNote, {
      fill: COLOR.noteFill,
      stroke: COLOR.noteStroke,
      ink: COLOR.ink,
    });
  }

  // Addressee and neutral opening line
  layout.gap(26);
  layout.drawText(MARGIN_X, layout.y, "regular", 9, COLOR.muted, toWinAnsi("Prepared for"));
  layout.paragraph(payload.candidateName, { font: "bold", size: 14, leading: 18, color: COLOR.ink });
  layout.gap(8);
  layout.paragraph("This letter confirms the offer described below.", {
    font: "regular",
    size: 11,
    leading: 16,
    color: COLOR.ink,
  });

  // Offer details
  layout.gap(10);
  layout.rule(layout.y, COLOR.rule, 0.6);
  layout.detailRow("Position", payload.designation);
  layout.detailRow("Department", payload.department);
  if (payload.location && payload.location.trim()) {
    layout.detailRow("Location", payload.location);
  }
  layout.detailRow("Expected joining date", formatCalendarDay(payload.expectedJoiningDate));

  // Terms, reproduced exactly as written by staff
  layout.gap(14);
  layout.ensure(40);
  layout.paragraph("Terms summary", { font: "bold", size: 12, leading: 16, color: COLOR.ink });
  layout.gap(2);
  layout.paragraph(payload.termsSummary, { font: "regular", size: 10.5, leading: 15, color: COLOR.ink });

  if (payload.extendedByName && payload.extendedByName.trim()) {
    layout.gap(10);
    layout.paragraph(`Extended by ${payload.extendedByName}`, {
      font: "regular",
      size: 10,
      leading: 14,
      color: COLOR.muted,
    });
  }

  if (payload.acceptance) {
    const { signedName, signedAt, documentHash } = payload.acceptance;
    layout.gap(6);
    layout.callout(
      "Electronic acceptance",
      `Accepted electronically by ${signedName} on ${formatLetterDateTime(signedAt, payload.timeZone)} · Document hash ${documentHash.slice(0, 16)}`,
      { fill: COLOR.successFill, stroke: COLOR.successStroke, ink: COLOR.successInk }
    );
  } else if (!payload.statusNote) {
    layout.gap(10);
    layout.paragraph("To respond to this offer, sign in to the GARA Innovation candidate portal.", {
      font: "regular",
      size: 10,
      leading: 14,
      color: COLOR.muted,
    });
  }

  // Footer on every page
  const pageCount = layout.pages.length;
  layout.pages.forEach((ops, index) => {
    ops.push(
      "BT",
      "/F1 8 Tf",
      `${COLOR.muted} rg`,
      `${num(MARGIN_X)} ${num(FOOTER_Y)} Td`,
      `(${escapePdfLiteral(toWinAnsi(`Offer reference ${reference} · Page ${index + 1} of ${pageCount}`))}) Tj`,
      "ET"
    );
  });

  // Objects: 1 catalog, 2 page tree, 3-4 fonts, 5 info, then a page + content pair per page.
  const firstPageObject = 6;
  const pageObjectNumbers = layout.pages.map((_, index) => firstPageObject + index * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Title (${escapePdfLiteral(toWinAnsi(`Offer letter ${reference}`))}) /Producer (GARA Innovation) >>`,
  ];

  layout.pages.forEach((ops, index) => {
    const contentObject = firstPageObject + index * 2 + 1;
    // Every operator is ASCII (text is escaped), so the length in bytes equals the length.
    const content = ops.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObject} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
    );
  });

  return assemblePdfDocument(objects, { encoding: "latin1", infoObjectNumber: 5 });
}

/** Lower-case hex SHA-256 of PDF bytes (the e-signature document hash). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
