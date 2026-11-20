import { CertificatePdfPayload } from "./types";

/**
 * Escapes characters for PDF literal text strings: ( ) \
 */
export function escapePdfString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export interface PdfAssemblyOptions {
  /**
   * How the document text is serialized. "latin1" writes one byte per character and is
   * required for content that contains WinAnsi bytes; "utf-8" is kept for the certificate.
   */
  encoding?: "latin1" | "utf-8";
  /** Object number of an /Info dictionary to reference from the trailer. */
  infoObjectNumber?: number;
}

/**
 * Serializes numbered PDF objects (object 1 must be the catalog) into a complete PDF 1.4
 * file with a cross-reference table. Output depends only on the inputs, so the same objects
 * always produce the same bytes.
 */
export function assemblePdfDocument(objects: readonly string[], options: PdfAssemblyOptions = {}): Buffer {
  const encoding = options.encoding ?? "latin1";
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(output, encoding));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, encoding);
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";

  for (const offset of offsets) {
    output += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  const info = options.infoObjectNumber ? ` /Info ${options.infoObjectNumber} 0 R` : "";
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${info} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, encoding);
}

export class VectorPdfBuilder {
  /**
   * Generates a standard A4 Landscape (842 x 595 pt) Certificate PDF.
   */
  public static async buildCertificate(payload: CertificatePdfPayload): Promise<Buffer> {
    const pageWidth = 842;
    const pageHeight = 595;

    // Generate QR matrix. qrcode is loaded only when a certificate is rendered, not on cold start.
    const { create: createQrCode } = await import("qrcode");
    const qr = createQrCode(payload.verificationUrl, { errorCorrectionLevel: "M" });
    const qrModules = qr.modules;
    const qrSize = qrModules.size;

    const streamOps: string[] = [];

    // Background fill (Clean warm white / off-white #F8FAFC)
    streamOps.push("0.973 0.980 0.988 rg");
    streamOps.push(`0 0 ${pageWidth} ${pageHeight} re f`);

    // Outer Decorative Slate Border (#0F172A)
    streamOps.push("0.059 0.090 0.165 RG");
    streamOps.push("3.5 w");
    streamOps.push(`24 24 ${pageWidth - 48} ${pageHeight - 48} re s`);

    // Inner Gold Border (#D97706)
    streamOps.push("0.851 0.467 0.024 RG");
    streamOps.push("1.2 w");
    streamOps.push(`30 30 ${pageWidth - 60} ${pageHeight - 60} re s`);

    // Corner decorative accents
    const cornerSize = 14;
    streamOps.push("0.851 0.467 0.024 rg");
    // Top-left
    streamOps.push(`33 ${pageHeight - 33 - cornerSize} ${cornerSize} ${cornerSize} re f`);
    // Top-right
    streamOps.push(`${pageWidth - 33 - cornerSize} ${pageHeight - 33 - cornerSize} ${cornerSize} ${cornerSize} re f`);
    // Bottom-left
    streamOps.push(`33 33 ${cornerSize} ${cornerSize} re f`);
    // Bottom-right
    streamOps.push(`${pageWidth - 33 - cornerSize} 33 ${cornerSize} ${cornerSize} re f`);

    // Header emblem/rule
    streamOps.push("0.851 0.467 0.024 RG");
    streamOps.push("1.5 w");
    streamOps.push(`220 ${pageHeight - 110} m 622 ${pageHeight - 110} l s`);

    // --- TEXT BLOCKS ---
    // Centred lines use an average glyph width (standard Type1 fonts, no metrics table).
    const glyphWidth = { F1: 0.5, F2: 0.56, F3: 0.5 } as const;
    const centeredText = (text: string, font: keyof typeof glyphWidth, size: number, fromTop: number, color: string) => {
      const width = text.length * size * glyphWidth[font];
      const x = Math.max(60, Math.floor((pageWidth - width) / 2));
      streamOps.push("BT");
      streamOps.push(`/${font} ${size} Tf`);
      streamOps.push(`${color} rg`);
      streamOps.push(`${x} ${pageHeight - fromTop} Td`);
      streamOps.push(`(${escapePdfString(text)}) Tj`);
      streamOps.push("ET");
    };
    const ink = "0.059 0.090 0.165";
    const muted = "0.40 0.45 0.52";
    const body = "0.25 0.30 0.38";
    const gold = "0.851 0.467 0.024";

    centeredText(payload.companyName ?? "GARA INNOVATION", "F2", 16, 95, ink);
    centeredText(payload.title ?? "CERTIFICATE OF COMPLETION", "F2", 26, 150, ink);
    centeredText("THIS RECOGNITION IS PROUDLY PRESENTED TO", "F1", 10, 180, muted);
    centeredText(payload.recipientName, "F3", 28, 225, ink);

    // Recipient underline in gold
    streamOps.push(`${gold} RG`);
    streamOps.push("1.5 w");
    streamOps.push(`180 ${pageHeight - 235} m 662 ${pageHeight - 235} l s`);

    if (payload.collegeName) {
      centeredText(`of ${payload.collegeName}`, "F1", 11, 252, body);
    }
    centeredText(
      payload.statement ??
        "for successfully completing the internship programme and fulfilling all required milestones in",
      "F1",
      12,
      275,
      body
    );
    centeredText(payload.programmeTitle, "F2", 15, 298, ink);

    const period = payload.periodStart
      ? `${payload.periodStart} to ${payload.completionDate}`
      : `Completion Date: ${payload.completionDate}`;
    centeredText([payload.domain, period].filter(Boolean).join("    |    "), "F1", 10, 322, muted);

    const work = [
      payload.projectTitle ? `Project: ${payload.projectTitle}` : null,
      payload.grade ? `Grade: ${payload.grade}` : null,
    ].filter(Boolean);
    if (work.length > 0) {
      centeredText(work.join("    |    "), "F1", 10, 340, muted);
    }
    centeredText(`Issued on: ${payload.issueDate}`, "F1", 9, work.length > 0 ? 358 : 340, muted);

    // --- FOOTER SECTION ---
    // Signature blocks: left, and centre when a second signatory is set.
    const signatureBlock = (x: number, name: string, title: string) => {
      streamOps.push("0.30 0.35 0.42 RG");
      streamOps.push("1.0 w");
      streamOps.push(`${x} ${pageHeight - 480} m ${x + 200} ${pageHeight - 480} l s`);
      streamOps.push("BT");
      streamOps.push("/F2 12 Tf");
      streamOps.push(`${ink} rg`);
      streamOps.push(`${x} ${pageHeight - 498} Td`);
      streamOps.push(`(${escapePdfString(name)}) Tj`);
      streamOps.push("ET");
      streamOps.push("BT");
      streamOps.push("/F1 10 Tf");
      streamOps.push(`${muted} rg`);
      streamOps.push(`${x} ${pageHeight - 513} Td`);
      streamOps.push(`(${escapePdfString(title)}) Tj`);
      streamOps.push("ET");
      streamOps.push("BT");
      streamOps.push("/F2 9 Tf");
      streamOps.push(`${gold} rg`);
      streamOps.push(`${x} ${pageHeight - 526} Td`);
      streamOps.push(`(${escapePdfString("GARA Innovation Authority")}) Tj`);
      streamOps.push("ET");
    };
    signatureBlock(80, payload.signatoryName, payload.signatoryTitle);
    if (payload.secondSignatoryName && payload.secondSignatoryTitle) {
      signatureBlock(340, payload.secondSignatoryName, payload.secondSignatoryTitle);
    }

    if (payload.companyFacts) {
      centeredText(payload.companyFacts, "F1", 7.5, 552, muted);
    }

    // Center-Right: QR Code & Verification Block
    const qrTargetDim = 72;
    const qrX = 640;
    const qrY = pageHeight - 515;
    const cellSize = qrTargetDim / qrSize;

    // Draw Vector QR Code
    streamOps.push("0.059 0.090 0.165 rg");
    for (let r = 0; r < qrSize; r++) {
      for (let c = 0; c < qrSize; c++) {
        if (qrModules.get(r, c)) {
          const cx = qrX + c * cellSize;
          const cy = qrY + (qrSize - 1 - r) * cellSize;
          streamOps.push(`${cx.toFixed(2)} ${cy.toFixed(2)} ${cellSize.toFixed(2)} ${cellSize.toFixed(2)} re f`);
        }
      }
    }

    // QR Code Border
    streamOps.push("0.851 0.467 0.024 RG");
    streamOps.push("0.8 w");
    streamOps.push(`${qrX - 3} ${qrY - 3} ${qrTargetDim + 6} ${qrTargetDim + 6} re s`);

    // Verification text below/beside QR
    streamOps.push("BT");
    streamOps.push("/F2 8.5 Tf");
    streamOps.push("0.059 0.090 0.165 rg");
    streamOps.push(`${qrX - 5} ${pageHeight - 528} Td`);
    streamOps.push(`(${escapePdfString("VERIFIED CREDENTIAL")}) Tj`);
    streamOps.push("ET");

    streamOps.push("BT");
    streamOps.push("/F1 7.5 Tf");
    streamOps.push("0.35 0.40 0.48 rg");
    streamOps.push(`${qrX - 15} ${pageHeight - 540} Td`);
    streamOps.push(`(ID: ${escapePdfString(payload.verificationCode)}) Tj`);
    streamOps.push("ET");

    const contentStream = streamOps.join("\n");
    const streamBuffer = Buffer.from(contentStream, "utf-8");

    // Assemble PDF Objects
    const objects: string[] = [];

    // Object 1: Catalog
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");

    // Object 2: Pages
    objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");

    // Object 3: Page
    objects.push(`<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 ${pageWidth} ${pageHeight}]
  /Contents 4 0 R
  /Resources <<
    /Font <<
      /F1 5 0 R
      /F2 6 0 R
      /F3 7 0 R
    >>
  >>
>>`);

    // Object 4: Content Stream
    objects.push(`<< /Length ${streamBuffer.length} >>\nstream\n${contentStream}\nendstream`);

    // Object 5: Font F1 (Helvetica)
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

    // Object 6: Font F2 (Helvetica-Bold)
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    // Object 7: Font F3 (Times-Bold)
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");

    // The certificate keeps its historical UTF-8 serialization so its bytes do not change.
    return assemblePdfDocument(objects, { encoding: "utf-8" });
  }
}
