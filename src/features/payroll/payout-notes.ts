/**
 * Payout details currently live in `Employee.internalNotes` as a marked block:
 *   PAYROLL_PROFILE:{...json...}
 * Only the payroll module (gated by `canPayroll`) may write that block. Other modules
 * must reject input containing the marker and strip the block before displaying notes.
 * Pure helpers: safe to import from any server module.
 */

export const PAYROLL_PROFILE_MARKER = "PAYROLL_PROFILE:";

export interface PayoutProfileBlock {
  start: number;
  end: number;
  json: string;
}

/**
 * Locates the payout block with a string-aware brace scanner (values may contain "}").
 */
export function locatePayoutProfileBlock(notes: string): PayoutProfileBlock | null {
  const markerIndex = notes.indexOf(PAYROLL_PROFILE_MARKER);
  if (markerIndex === -1) return null;

  let i = markerIndex + PAYROLL_PROFILE_MARKER.length;
  while (i < notes.length && /\s/.test(notes[i])) i++;
  if (notes[i] !== "{") return null;

  const jsonStart = i;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < notes.length; i++) {
    const ch = notes[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { start: markerIndex, end: i + 1, json: notes.slice(jsonStart, i + 1) };
      }
    }
  }
  return null;
}

/** True when free text tries to carry a payout block (reserved for the payroll module). */
export function containsPayoutProfileMarker(text: string | null | undefined): boolean {
  return typeof text === "string" && text.toUpperCase().includes(PAYROLL_PROFILE_MARKER);
}

/**
 * Removes the payout block (bank account, PAN, amount) so notes can be shown outside payroll.
 */
export function stripPayoutProfile(notes: string | null | undefined): string | null {
  if (!notes) return notes ?? null;
  const block = locatePayoutProfileBlock(notes);
  const withoutBlock = block
    ? `${notes.slice(0, block.start)}${notes.slice(block.end)}`
    : notes.split(PAYROLL_PROFILE_MARKER)[0];
  const trimmed = withoutBlock.trim();
  return trimmed ? trimmed : null;
}
