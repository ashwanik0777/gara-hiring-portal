/**
 * Client-safe helpers for the emailed one-time code steps (sign-up email verification and
 * the sign-in code). The values mirror the server settings in src/lib/auth/auth.ts, which
 * cannot be imported into client bundles; a unit test keeps them in sync.
 */
export const OTP_CODE_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** What a failed auth call reported, reduced to what the UI needs. Never shown verbatim. */
export interface OtpFailure {
  code?: string;
  status?: number;
  network?: boolean;
}

export type OtpResult = { ok: true } | { ok: false; failure: OtpFailure };

/** Reduces a Better Auth client error (`{ code, status, message }`) to an OtpFailure. */
export function toOtpFailure(error: { code?: string | null; status?: number | null } | null | undefined): OtpFailure {
  return {
    code: typeof error?.code === "string" ? error.code : undefined,
    status: typeof error?.status === "number" ? error.status : undefined,
  };
}

// A run of exactly six digits. No look-behind: older Safari versions cannot parse it.
const STANDALONE_CODE = new RegExp(`(?:^|\\D)(\\d{${OTP_CODE_LENGTH}})(?!\\d)`);

/**
 * Keeps only the code digits. A pasted message such as "Your code: 123456" yields the
 * standalone six-digit group; anything else is reduced to its first six digits.
 */
export function normalizeOtpInput(raw: string): string {
  const standalone = STANDALONE_CODE.exec(raw);
  if (standalone?.[1]) {
    return standalone[1];
  }
  return raw.replace(/\D/g, "").slice(0, OTP_CODE_LENGTH);
}

/** "jane.doe@example.com" → "ja•••@example.com" (the domain stays readable). */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) {
    return trimmed;
  }
  const local = trimmed.slice(0, at);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}•••${trimmed.slice(at)}`;
}

/** Friendly text for a failed verify or resend; raw codes are never shown. */
export function describeOtpError(failure: OtpFailure, action: "verify" | "resend"): string {
  if (failure.network) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  switch (failure.code) {
    case "INVALID_OTP":
    case "INVALID_CODE":
      return "That code isn't right. Check the email and try again.";
    case "OTP_EXPIRED":
    case "OTP_HAS_EXPIRED":
      return "This code has expired. Request a new code.";
    case "TOO_MANY_ATTEMPTS":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Too many incorrect attempts. Request a new code.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Too many incorrect codes. For your security, sign-in is paused for 15 minutes.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "This sign-in attempt has expired. Go back and sign in again.";
    default:
      break;
  }
  if (failure.status === 429) {
    return action === "resend"
      ? "You've asked for several codes. Please wait a minute before requesting another."
      : "Too many attempts. Please wait a minute and try again.";
  }
  return action === "resend"
    ? "We couldn't send a new code right now. Please try again in a moment."
    : "We couldn't check the code right now. Please try again.";
}

/** True when the code in the input can no longer succeed and should be cleared. */
export function isCodeExhausted(failure: OtpFailure): boolean {
  return (
    failure.code === "OTP_EXPIRED" ||
    failure.code === "OTP_HAS_EXPIRED" ||
    failure.code === "TOO_MANY_ATTEMPTS" ||
    failure.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"
  );
}

export function describeSignInError(failure: OtpFailure): string {
  if (failure.network) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (failure.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "Invalid email or password. Please try again.";
  }
  if (failure.code === "INVALID_EMAIL") {
    return "Please enter a valid email address.";
  }
  if (failure.status === 429) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }
  return "We couldn't sign you in. Please try again.";
}

export function describeSignUpError(failure: OtpFailure): string {
  if (failure.network) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  switch (failure.code) {
    case "PASSWORD_TOO_SHORT":
      return "Password must be at least 8 characters long.";
    case "PASSWORD_TOO_LONG":
      return "Password must be at most 128 characters long.";
    case "INVALID_EMAIL":
      return "Please enter a valid email address.";
    default:
      break;
  }
  if (failure.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "We couldn't create your account. Please try again.";
}

/**
 * Message for the `?error=` code Better Auth adds when Google sign-in fails. Unknown codes
 * get a generic message; the raw value is never shown.
 */
export function describeGoogleSignInError(code: string | null): string | null {
  if (!code) {
    return null;
  }
  if (code === "account_not_linked") {
    return "This email already has a password account that isn't verified yet. Sign in with your email and password first (we'll email you a code). After that, Continue with Google works too.";
  }
  return "Google sign-in didn't complete. Please try again or sign in with your email and password.";
}

/** True when a sign-in response asks for the emailed second-step code. */
export function isTwoFactorRedirect(data: unknown): boolean {
  return typeof data === "object" && data !== null && "twoFactorRedirect" in data && data.twoFactorRedirect === true;
}
