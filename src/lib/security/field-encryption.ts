import crypto from "node:crypto";
import { decodePayoutEncryptionKey, env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";

/**
 * Authenticated encryption (AES-256-GCM) for sensitive database fields: payout account
 * numbers and PANs. Server-only (Node `crypto`, server env vars).
 *
 * Stored format: `v1:<iv>:<tag>:<ciphertext>`, each part base64url. Every value gets a
 * fresh random 12-byte IV, and the 16-byte authentication tag rejects any modification.
 * Each value is also bound to a caller-supplied context (for example
 * `employee-payout:<employeeId>:accountNumber`) as additional authenticated data, so a
 * ciphertext copied to another row or column does not decrypt.
 *
 * Key: `PAYOUT_ENCRYPTION_KEY` (32 bytes, base64 or hex; validated in env.ts). Without it,
 * production refuses to encrypt; development and test derive a local key from
 * BETTER_AUTH_SECRET (HKDF with a purpose label) and log a warning once. Values encrypted
 * with that development key cannot be read after a real key is configured.
 */

export const FIELD_ENCRYPTION_VERSION = "v1";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const DEV_KEY_SALT = "gara-field-encryption";
const DEV_KEY_INFO = "payout-profile-fields:v1";
const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Operational: production has no payout key, so bank details cannot be stored. */
export class FieldEncryptionUnavailableError extends AppError {
  constructor() {
    super(
      "Payout bank details can't be saved until the payout encryption key is configured. Ask a system administrator to configure it, then try again.",
      "FIELD_ENCRYPTION_NOT_CONFIGURED",
      503
    );
  }
}

/** Internal: a stored value is malformed, was modified, or belongs to another context or key. */
export class FieldDecryptionError extends Error {
  constructor(message = "An encrypted field could not be decrypted.") {
    super(message);
    this.name = "FieldDecryptionError";
  }
}

export interface FieldEncryptionConfig {
  nodeEnv: "development" | "test" | "production";
  /** Raw PAYOUT_ENCRYPTION_KEY (base64 or hex). Missing or empty means "not configured". */
  encryptionKey?: string;
  /** BETTER_AUTH_SECRET: only used to derive the non-production fallback key. */
  authSecret: string;
}

export type FieldKeySource = "configured" | "development";

interface ResolvedKey {
  key: Buffer;
  source: FieldKeySource;
}

/** Resolves the key for `config`; null in production when no key is configured. */
export function resolveFieldEncryptionKey(config: FieldEncryptionConfig): ResolvedKey | null {
  const raw = config.encryptionKey?.trim();
  if (raw) {
    const key = decodePayoutEncryptionKey(raw);
    if (!key) {
      // env.ts rejects malformed keys at boot; this guards direct callers.
      throw new Error("PAYOUT_ENCRYPTION_KEY is not a valid 32-byte key.");
    }
    return { key, source: "configured" };
  }
  if (config.nodeEnv === "production") {
    return null;
  }
  const derived = crypto.hkdfSync("sha256", config.authSecret, DEV_KEY_SALT, DEV_KEY_INFO, KEY_BYTES);
  return { key: Buffer.from(derived), source: "development" };
}

function assertContext(context: string): Buffer {
  if (!context) {
    throw new Error("Field encryption requires a non-empty context.");
  }
  return Buffer.from(context, "utf8");
}

function decodePart(part: string, label: string): Buffer {
  if (!BASE64URL.test(part)) {
    throw new FieldDecryptionError(`Encrypted field has an invalid ${label}.`);
  }
  return Buffer.from(part, "base64url");
}

export class FieldEncryptor {
  private resolved: ResolvedKey | null | undefined;
  private warned = false;

  constructor(private readonly loadConfig: () => FieldEncryptionConfig) {}

  /** Where the key comes from, or null when encryption is unavailable (production, no key). */
  keySource(): FieldKeySource | null {
    return this.key()?.source ?? null;
  }

  /** Encrypts `plaintext` bound to `context`. Throws FieldEncryptionUnavailableError in production without a key. */
  encrypt(plaintext: string, context: string): string {
    const key = this.requireKey();
    const aad = assertContext(context);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      FIELD_ENCRYPTION_VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":");
  }

  /**
   * Decrypts a value produced by `encrypt` with the same context. Only for server-side
   * consumers that genuinely need the full value (a future bank export); never for display.
   */
  decrypt(payload: string, context: string): string {
    const key = this.requireKey();
    const aad = assertContext(context);
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== FIELD_ENCRYPTION_VERSION) {
      throw new FieldDecryptionError("Unsupported encrypted field format.");
    }
    const iv = decodePart(parts[1], "IV");
    const tag = decodePart(parts[2], "authentication tag");
    const ciphertext = decodePart(parts[3], "ciphertext");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new FieldDecryptionError("Encrypted field has an invalid IV or authentication tag.");
    }
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key, wrong context or modified data: never return partial plaintext.
      throw new FieldDecryptionError();
    }
  }

  private key(): ResolvedKey | null {
    if (this.resolved === undefined) {
      this.resolved = resolveFieldEncryptionKey(this.loadConfig());
    }
    if (this.resolved?.source === "development" && !this.warned) {
      this.warned = true;
      logger.warn(
        "PAYOUT_ENCRYPTION_KEY is not set: payout bank details are encrypted with a development key derived from BETTER_AUTH_SECRET. Configure a real key before production."
      );
    }
    return this.resolved;
  }

  private requireKey(): Buffer {
    const resolved = this.key();
    if (!resolved) {
      throw new FieldEncryptionUnavailableError();
    }
    return resolved.key;
  }
}

/** Encryptor for payout bank details (account number, PAN), keyed by PAYOUT_ENCRYPTION_KEY. */
export const payoutFieldEncryptor = new FieldEncryptor(() => ({
  nodeEnv: env.NODE_ENV,
  encryptionKey: env.PAYOUT_ENCRYPTION_KEY,
  authSecret: env.BETTER_AUTH_SECRET,
}));
