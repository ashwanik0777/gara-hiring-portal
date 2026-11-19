/*
 * Admin-defined field patterns run against candidate input on the server. JavaScript
 * regular expressions backtrack, so a pattern such as `(a+)+$` or `\d+\d+\d+\d+$` can
 * take seconds or hours on a few hundred characters (ReDoS). Patterns are therefore
 * checked when a form is saved, and again before a stored pattern is run.
 *
 * The check is a conservative static analysis of the pattern source (no dependency):
 * it rejects backreferences, lookbehind, a repeated group that itself contains a
 * variable repeat or alternatives (`(a+)+`, `(a*)*`, `(a|aa)+`), and patterns whose
 * worst-case number of ways to split the input exceeds a cubic budget.
 */

/** Longest admin-configured regex pattern accepted for a field. */
export const MAX_FIELD_PATTERN_LENGTH = 200;

/**
 * Admin-configured patterns only run against answers up to this length, which bounds
 * the remaining (polynomial) backtracking cost.
 */
export const MAX_PATTERN_INPUT_LENGTH = 300;

/**
 * Upper bound of the worst-case split count: three open-ended repeats over the capped
 * input (300³ ≈ 2.7e7 steps, tens of milliseconds). A fourth one measured ~3 s.
 */
const MAX_PATTERN_COST = MAX_PATTERN_INPUT_LENGTH ** 3;

export const PATTERN_TOO_LONG_MESSAGE = `Validation pattern cannot exceed ${MAX_FIELD_PATTERN_LENGTH} characters`;
export const PATTERN_INVALID_MESSAGE = "Validation pattern is not a valid regular expression";
export const PATTERN_BACKREFERENCE_MESSAGE =
  "Validation pattern cannot use backreferences such as \\1 or \\k<name>. Describe the format directly instead.";
export const PATTERN_LOOKBEHIND_MESSAGE =
  "Validation pattern cannot use lookbehind ((?<= or (?<!). Describe the format directly instead.";
export const PATTERN_NESTED_REPEAT_MESSAGE =
  "Validation pattern repeats a group that itself repeats or has alternatives, such as (a+)+ or (a|aa)+, which can make checking extremely slow. Use a character class such as [a-z]+ instead.";
export const PATTERN_TOO_COMPLEX_MESSAGE =
  "Validation pattern has too many open-ended repeats (+, *, {n,}) to check quickly. Simplify it, for example with fixed counts such as {3}.";

export type PatternSafety = { safe: true } | { safe: false; reason: string };

interface Quantifier {
  min: number;
  max: number;
  /** Characters consumed, including a trailing lazy `?`. */
  length: number;
}

interface GroupFrame {
  /** Product of the split factors inside the group (over-estimated across alternatives). */
  cost: number;
  /** Alternatives at this level (`|` count + 1). */
  alternatives: number;
  /** A variable repeat (`*`, `+`, `?`, `{n,m}`) anywhere inside, nested groups included. */
  hasVariableRepeat: boolean;
  /** Alternation anywhere inside, nested groups included. */
  hasAlternation: boolean;
}

type PreviousToken = { kind: "atom" } | { kind: "group"; frame: GroupFrame; groupCost: number } | null;

const BOUNDED_QUANTIFIER = /^\{(\d+)(,(\d*))?\}/;

function readQuantifier(source: string, index: number): Quantifier | null {
  const ch = source[index];
  let quantifier: Quantifier | null = null;
  if (ch === "*") quantifier = { min: 0, max: Infinity, length: 1 };
  else if (ch === "+") quantifier = { min: 1, max: Infinity, length: 1 };
  else if (ch === "?") quantifier = { min: 0, max: 1, length: 1 };
  else if (ch === "{") {
    // Without the `u` flag a `{` that is not a well-formed quantifier is a literal.
    const match = BOUNDED_QUANTIFIER.exec(source.slice(index));
    if (!match) return null;
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : match[3] === "" ? Infinity : Number(match[3]);
    quantifier = { min, max, length: match[0].length };
  }
  if (quantifier && source[index + quantifier.length] === "?") {
    quantifier.length += 1;
  }
  return quantifier;
}

/** Number of ways a variable repeat can split the (capped) input. */
function splitFactor(quantifier: Quantifier): number {
  return Math.min(quantifier.max - quantifier.min + 1, MAX_PATTERN_INPUT_LENGTH);
}

/** Index just past the character class that starts at `index` (`[`). */
function skipCharacterClass(source: string, index: number): number {
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === "\\") i += 2;
    else if (source[i] === "]") return i + 1;
    else i += 1;
  }
  return i;
}

const unsafe = (reason: string): PatternSafety => ({ safe: false, reason });

/**
 * Decides whether an admin-defined field pattern may be stored and run on candidate
 * input. Returns a friendly reason when it may not.
 */
export function checkFieldPatternSafety(pattern: string): PatternSafety {
  if (pattern.length > MAX_FIELD_PATTERN_LENGTH) return unsafe(PATTERN_TOO_LONG_MESSAGE);
  try {
    new RegExp(pattern);
  } catch {
    return unsafe(PATTERN_INVALID_MESSAGE);
  }

  const newFrame = (): GroupFrame => ({
    cost: 1,
    alternatives: 1,
    hasVariableRepeat: false,
    hasAlternation: false,
  });
  const stack: GroupFrame[] = [newFrame()];
  let previous: PreviousToken = null;
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    const frame = stack[stack.length - 1];

    if (ch === "\\") {
      const next = pattern[i + 1] ?? "";
      if (/[1-9]/.test(next) || (next === "k" && pattern[i + 2] === "<")) {
        return unsafe(PATTERN_BACKREFERENCE_MESSAGE);
      }
      i += 2;
      previous = { kind: "atom" };
      continue;
    }

    if (ch === "[") {
      i = skipCharacterClass(pattern, i);
      previous = { kind: "atom" };
      continue;
    }

    if (ch === "(") {
      if (pattern.startsWith("(?<=", i) || pattern.startsWith("(?<!", i)) {
        return unsafe(PATTERN_LOOKBEHIND_MESSAGE);
      }
      let bodyStart = i + 1;
      if (pattern[bodyStart] === "?") {
        // (?: (?= (?! take two characters; (?<name> runs to the closing `>`.
        bodyStart = pattern[bodyStart + 1] === "<" ? pattern.indexOf(">", bodyStart) + 1 : bodyStart + 2;
      }
      stack.push(newFrame());
      previous = null;
      i = bodyStart;
      continue;
    }

    if (ch === ")") {
      const closed = stack.pop();
      const parent = stack[stack.length - 1];
      // Unreachable for a pattern that compiled (groups are balanced); fail closed anyway.
      if (!closed || !parent) return unsafe(PATTERN_INVALID_MESSAGE);
      const groupCost = closed.cost * closed.alternatives;
      parent.cost *= groupCost;
      parent.hasVariableRepeat ||= closed.hasVariableRepeat;
      parent.hasAlternation ||= closed.hasAlternation;
      if (parent.cost > MAX_PATTERN_COST) return unsafe(PATTERN_TOO_COMPLEX_MESSAGE);
      previous = { kind: "group", frame: closed, groupCost };
      i += 1;
      continue;
    }

    if (ch === "|") {
      frame.alternatives += 1;
      frame.hasAlternation = true;
      previous = null;
      i += 1;
      continue;
    }

    const quantifier = previous ? readQuantifier(pattern, i) : null;
    if (quantifier && previous) {
      const variable = quantifier.max !== quantifier.min;
      const repeating = quantifier.max > 1;
      if (previous.kind === "group") {
        const inner = previous.frame;
        if (variable && repeating && (inner.hasVariableRepeat || inner.hasAlternation)) {
          return unsafe(PATTERN_NESTED_REPEAT_MESSAGE);
        }
        if (!variable && quantifier.min > 1 && previous.groupCost > 1) {
          // A fixed count repeats the group's own ambiguity: (a?){30} is a?a?…a? thirty times.
          frame.cost *= previous.groupCost ** (quantifier.min - 1);
        }
      }
      if (variable) {
        frame.hasVariableRepeat = true;
        frame.cost *= splitFactor(quantifier);
      }
      if (frame.cost > MAX_PATTERN_COST) return unsafe(PATTERN_TOO_COMPLEX_MESSAGE);
      // A quantified atom cannot be quantified again (`a**` does not compile).
      previous = null;
      i += quantifier.length;
      continue;
    }

    // Anchors cannot be repeated; everything else (`.`, literals, a literal `{`) is an atom.
    previous = ch === "^" || ch === "$" ? null : { kind: "atom" };
    i += 1;
  }

  return { safe: true };
}
