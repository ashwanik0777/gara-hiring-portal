/*
 * College names as typed by students: one stored row per name, whatever the spacing, case or
 * punctuation ("I.I.T. Delhi" and "iit  delhi" are the same college). Client and server safe.
 */

export const COLLEGE_NAME_MIN = 3;
export const COLLEGE_NAME_MAX = 150;

/** The display form: single spaces, trimmed. */
export function cleanCollegeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** The comparison key: lower case, letters/digits/& only, single spaces. */
export function normalizeCollegeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
