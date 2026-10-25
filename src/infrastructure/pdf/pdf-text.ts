/**
 * Text helpers for PDFs drawn with the standard Helvetica fonts using WinAnsiEncoding.
 *
 * The standard fonts only cover the WinAnsi character set (ASCII, Latin-1 and common
 * typographic punctuation). Text is therefore converted to WinAnsi bytes first: accented
 * letters outside the set are reduced to their base letter, a few symbols are spelled out,
 * and anything else becomes "?". Unsupported characters never reach the content stream, so
 * they cannot corrupt the PDF.
 *
 * A "WinAnsi string" below is a JavaScript string whose char codes are WinAnsi byte values
 * (0-255).
 */

export type StandardFont = "regular" | "bold";

/** Unicode code points that WinAnsi stores in 0x80-0x9F. */
const WIN_ANSI_HIGH: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], // euro sign
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85], // ellipsis
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91], // left single quote
  [0x2019, 0x92], // right single quote / apostrophe
  [0x201c, 0x93], // left double quote
  [0x201d, 0x94], // right double quote
  [0x2022, 0x95], // bullet
  [0x2013, 0x96], // en dash
  [0x2014, 0x97], // em dash
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

/** Characters outside WinAnsi that have a plain-text equivalent. */
const TRANSLITERATIONS: ReadonlyMap<number, string> = new Map([
  [0x20b9, "Rs."], // Indian rupee sign
  [0x2010, "-"],
  [0x2011, "-"],
  [0x2012, "-"],
  [0x2212, "-"], // minus sign
  [0x2032, "'"],
  [0x2033, '"'],
  [0x2190, "<-"],
  [0x2192, "->"],
  [0x2264, "<="],
  [0x2265, ">="],
  [0x2713, "v"], // check mark
]);

/** Space-like characters rendered as a plain space. */
function isSpaceLike(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0xa0 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000
  );
}

/** Invisible characters (zero-width spaces/joiners, BOM) that are dropped. */
function isInvisible(codePoint: number): boolean {
  return (codePoint >= 0x200b && codePoint <= 0x200d) || codePoint === 0x2060 || codePoint === 0xfeff;
}

/** WinAnsi byte for a single code point, or null when the code point is not in the set. */
function winAnsiByte(codePoint: number): number | null {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint;
  if (codePoint >= 0xa1 && codePoint <= 0xff) return codePoint;
  return WIN_ANSI_HIGH.get(codePoint) ?? null;
}

const COMBINING_MARK = /\p{M}/u;

/**
 * Converts one line of text (no line breaks) to a WinAnsi string. Control characters are
 * removed, unsupported letters are reduced to their base letter where possible and every
 * other unsupported character becomes "?".
 */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isSpaceLike(codePoint)) {
      out += " ";
      continue;
    }
    if (isInvisible(codePoint) || codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      continue;
    }
    // Stray combining marks (e.g. from scripts the font cannot show) carry no glyph of their own.
    if (COMBINING_MARK.test(char)) {
      continue;
    }
    const direct = winAnsiByte(codePoint);
    if (direct !== null) {
      out += String.fromCharCode(direct);
      continue;
    }
    const spelled = TRANSLITERATIONS.get(codePoint);
    if (spelled !== undefined) {
      out += spelled;
      continue;
    }
    // Compatibility decomposition, then drop the accents: "ő" -> "o", "ﬁ" -> "fi".
    const decomposed = char.normalize("NFKD").replace(/\p{M}/gu, "");
    let reduced = "";
    for (const part of decomposed) {
      const byte = winAnsiByte(part.codePointAt(0) ?? 0);
      if (byte === null) {
        reduced = "";
        break;
      }
      reduced += String.fromCharCode(byte);
    }
    out += reduced || "?";
  }
  return out;
}

/**
 * Escapes a WinAnsi string for a PDF literal string `( ... )`. Backslash and parentheses are
 * escaped, and every byte outside printable ASCII is written as an octal escape, so the
 * content stream stays pure ASCII.
 */
export function escapePdfLiteral(winAnsi: string): string {
  let out = "";
  for (let i = 0; i < winAnsi.length; i++) {
    const code = winAnsi.charCodeAt(i) & 0xff;
    if (code === 0x5c) out += "\\\\";
    else if (code === 0x28) out += "\\(";
    else if (code === 0x29) out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
    else out += `\\${code.toString(8).padStart(3, "0")}`;
  }
  return out;
}

// Glyph widths (1/1000 em) of the standard Helvetica fonts for WinAnsi 0x20-0x7E (Adobe AFM).
const HELVETICA_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
] as const;

const HELVETICA_BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
] as const;

/**
 * Widths for WinAnsi 0x80-0xFF that are not accented letters, as the larger of the regular
 * and bold widths. Accented letters use their base letter; anything unknown uses a full em,
 * so measurements never underestimate and wrapped text never overflows the margin.
 */
const HIGH_BYTE_WIDTHS: ReadonlyMap<number, number> = new Map([
  [0x80, 556], [0x82, 278], [0x83, 556], [0x84, 500], [0x85, 1000], [0x86, 556], [0x87, 556],
  [0x88, 333], [0x89, 1000], [0x8b, 333], [0x8c, 1000], [0x91, 278], [0x92, 278], [0x93, 500],
  [0x94, 500], [0x95, 350], [0x96, 556], [0x97, 1000], [0x98, 333], [0x99, 1000], [0x9b, 333],
  [0x9c, 944], [0xa1, 333], [0xa2, 556], [0xa3, 556], [0xa5, 556], [0xa7, 556], [0xa9, 737],
  [0xab, 556], [0xad, 333], [0xae, 737], [0xb0, 400], [0xb1, 584], [0xb7, 278], [0xbb, 556],
  [0xbf, 611], [0xc6, 1000], [0xd7, 584], [0xd8, 778], [0xdf, 611], [0xe6, 889], [0xf7, 584],
  [0xf8, 611],
]);

function glyphWidth(code: number, font: StandardFont): number {
  const table = font === "bold" ? HELVETICA_BOLD_ASCII : HELVETICA_ASCII;
  if (code >= 0x20 && code <= 0x7e) {
    return table[code - 0x20];
  }
  const known = HIGH_BYTE_WIDTHS.get(code);
  if (known !== undefined) {
    return known;
  }
  // Accented Latin letters (e.g. 0xE9 "é") share the width of their base letter.
  const unicode = code <= 0x9f ? null : String.fromCharCode(code);
  const base = unicode?.normalize("NFD").charCodeAt(0);
  if (base !== undefined && base >= 0x41 && base <= 0x7a && base !== code) {
    return table[base - 0x20];
  }
  return 1000;
}

/** Width of a WinAnsi string in points. */
export function measureWinAnsi(winAnsi: string, font: StandardFont, size: number): number {
  let units = 0;
  for (let i = 0; i < winAnsi.length; i++) {
    units += glyphWidth(winAnsi.charCodeAt(i) & 0xff, font);
  }
  return (units * size) / 1000;
}

/** Splits a word that is wider than the line into pieces that fit. */
function breakLongWord(word: string, font: StandardFont, size: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of word) {
    if (current && measureWinAnsi(current + char, font, size) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Wraps one paragraph (a WinAnsi string without line breaks) to lines no wider than
 * `maxWidth`. Runs of spaces collapse to one; an empty paragraph yields one empty line.
 */
export function wrapWinAnsi(winAnsi: string, font: StandardFont, size: number, maxWidth: number): string[] {
  const words = winAnsi.split(" ").filter((word) => word.length > 0);
  if (words.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureWinAnsi(candidate, font, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (measureWinAnsi(word, font, size) <= maxWidth) {
      current = word;
    } else {
      const pieces = breakLongWord(word, font, size, maxWidth);
      lines.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1] ?? "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Wraps multi-line text: line breaks (\n, \r\n, \r) start a new paragraph and blank lines
 * are kept, so the layout follows the text as written.
 */
export function wrapText(text: string, font: StandardFont, size: number, maxWidth: number): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((paragraph) => wrapWinAnsi(toWinAnsi(paragraph), font, size, maxWidth));
}
