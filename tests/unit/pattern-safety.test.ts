import { describe, it, expect } from "vitest";
import {
  checkFieldPatternSafety,
  MAX_PATTERN_INPUT_LENGTH,
  PATTERN_BACKREFERENCE_MESSAGE,
  PATTERN_INVALID_MESSAGE,
  PATTERN_LOOKBEHIND_MESSAGE,
  PATTERN_NESTED_REPEAT_MESSAGE,
  PATTERN_TOO_COMPLEX_MESSAGE,
  PATTERN_TOO_LONG_MESSAGE,
} from "@/features/application-forms/pattern-safety";
import { formFieldDefinitionSchema } from "@/features/application-forms/schemas";

// ---------------------------------------------------------------------------
// ReDoS guard for admin-defined field patterns (round 8)
// ---------------------------------------------------------------------------

const reasonOf = (pattern: string) => {
  const result = checkFieldPatternSafety(pattern);
  return result.safe ? null : result.reason;
};

describe("checkFieldPatternSafety", () => {
  it.each([
    "^(a+)+$",
    "^(a*)*$",
    "^(a+)*$",
    "^(a|aa)+$",
    "^(a|a)*$",
    "^(?:a+){2,}$",
    "^((ab)*)+$",
    "^([a-z]+)*@example\\.com$",
    "^(\\w+\\s?)+$",
    "^(\\d+|\\d+-)+$",
    "^(?<word>\\w+)+$",
    // The classic "evil" e-mail pattern.
    "^([a-zA-Z0-9])(([\\-.]|[_]+)?([a-zA-Z0-9]+))*(@){1}[a-z0-9]+[.]{1}(([a-z]{2,3})|([a-z]{2,3}[.]{1}[a-z]{2,3}))$",
  ])("rejects the nested repeat %s", (pattern) => {
    expect(reasonOf(pattern)).toBe(PATTERN_NESTED_REPEAT_MESSAGE);
  });

  it.each([
    "^\\d+\\d+\\d+\\d+$",
    "^(.*a){12}$",
    "^(a?){30}a{30}$",
    `^${"a?".repeat(25)}$`,
    "^(a|aa){40}$",
  ])("rejects the polynomial or exponential blow-up %s", (pattern) => {
    expect(reasonOf(pattern)).toBe(PATTERN_TOO_COMPLEX_MESSAGE);
  });

  it("rejects backreferences, lookbehind, invalid and oversized patterns", () => {
    expect(reasonOf("^(a)\\1$")).toBe(PATTERN_BACKREFERENCE_MESSAGE);
    expect(reasonOf("^(?<x>a)\\k<x>$")).toBe(PATTERN_BACKREFERENCE_MESSAGE);
    expect(reasonOf("(?<=a)b")).toBe(PATTERN_LOOKBEHIND_MESSAGE);
    expect(reasonOf("(?<!a)b")).toBe(PATTERN_LOOKBEHIND_MESSAGE);
    expect(reasonOf("([a-z")).toBe(PATTERN_INVALID_MESSAGE);
    expect(reasonOf("a".repeat(201))).toBe(PATTERN_TOO_LONG_MESSAGE);
  });

  it.each([
    "^[A-Z]{3}$",
    "^[A-Z]{5}[0-9]{4}[A-Z]$",
    "^\\d{6}$",
    "^\\+?[0-9\\s().-]{7,20}$",
    "^(\\d{1,3}\\.){3}\\d{1,3}$",
    "^https?://(www\\.)?linkedin\\.com/in/[A-Za-z0-9_-]+/?$",
    "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    "^\\d*\\d*\\d*$",
    "^(jpg|png|gif)$",
    "^(?:https?://)?github\\.com/[\\w-]+$",
    "^[\\1a-z]+$",
    "^a{2}b{0,3}$",
    "^\\{x+\\}$",
    "^(?=.*\\d)[A-Za-z\\d]{8,}$",
    "^[A-Za-z ]+$",
  ])("accepts the ordinary pattern %s", (pattern) => {
    expect(checkFieldPatternSafety(pattern)).toEqual({ safe: true });
  });

  it("every accepted shape stays fast on the capped input length", () => {
    const hostile = `${"a".repeat(MAX_PATTERN_INPUT_LENGTH - 1)}!`;
    for (const pattern of ["^\\d*\\d*\\d*$", "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", "^(\\d{1,3}\\.){3}\\d{1,3}$"]) {
      expect(checkFieldPatternSafety(pattern).safe).toBe(true);
      const started = Date.now();
      new RegExp(pattern).test(pattern.includes("@") ? "@".repeat(MAX_PATTERN_INPUT_LENGTH) : hostile);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });
});

describe("form field patterns are checked when the form is saved", () => {
  const field = (pattern: string) => ({
    id: "f1",
    name: "code",
    label: "Code",
    type: "text" as const,
    required: false,
    order: 0,
    validation: { pattern },
  });

  it("refuses catastrophic patterns with a friendly message", () => {
    const parsed = formFieldDefinitionSchema.safeParse(field("^(a+)+$"));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(PATTERN_NESTED_REPEAT_MESSAGE);

    const lookbehind = formFieldDefinitionSchema.safeParse(field("(?<=x)y"));
    expect(lookbehind.error?.issues[0]?.message).toBe(PATTERN_LOOKBEHIND_MESSAGE);
  });

  it("keeps ordinary patterns", () => {
    expect(formFieldDefinitionSchema.safeParse(field("^[A-Z]{3}-\\d{4}$")).success).toBe(true);
  });
});
