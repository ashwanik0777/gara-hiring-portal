import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { StorageService, StorageUploadResult, StorageGetResult } from "./types";

export const ALLOWED_PRIVATE_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const MAX_PRIVATE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Safe local filesystem storage provider for development environments.
 * Strictly writes to `.storage/private/`, completely outside `public/` to prevent web exposure.
 *
 * POLICY GUARD (OD-013):
 * Throws in production environments so local disk storage cannot accidentally become
 * the unapproved production default.
 */
export class LocalStorageService implements StorageService {
  private readonly baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir
      ? path.resolve(/*turbopackIgnore: true*/ customBaseDir)
      : path.join(/*turbopackIgnore: true*/ process.cwd(), ".storage", "private");
  }

  private assertSafeEnvironment(): void {
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.ALLOW_LOCAL_STORAGE_IN_PROD
    ) {
      throw new Error(
        "[Security Policy Violation: OD-013] Local disk storage is prohibited in production. " +
          "Configure an approved cloud object storage provider (AWS S3, Cloudflare R2, or GCP) " +
          "before running in production."
      );
    }
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  /**
   * Resolves a storage key and verifies that the resolved filesystem path stays
   * strictly inside `this.baseDir`, preventing all directory traversal attacks.
   */
  public resolveSafePath(storageKey: string): string {
    if (!storageKey || storageKey.includes("\0")) {
      throw new ValidationError("Invalid storage key.");
    }
    const resolved = path.resolve(
      /*turbopackIgnore: true*/ this.baseDir,
      storageKey
    );
    const baseWithSep = this.baseDir.endsWith(path.sep)
      ? this.baseDir
      : `${this.baseDir}${path.sep}`;

    if (!resolved.startsWith(baseWithSep)) {
      throw new ForbiddenError(
        "Path traversal attempt detected and blocked."
      );
    }

    return resolved;
  }

  public validateUploadInput(
    fileBuffer: Buffer | Uint8Array,
    mimeType: string
  ): void {
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      throw new ValidationError("Uploaded file cannot be empty.");
    }
    if (fileBuffer.byteLength > MAX_PRIVATE_UPLOAD_BYTES) {
      throw new ValidationError(
        `Uploaded file exceeds the maximum allowed size of ${MAX_PRIVATE_UPLOAD_BYTES / (1024 * 1024)} MB.`
      );
    }
    if (!ALLOWED_PRIVATE_UPLOAD_MIME_TYPES.has(mimeType)) {
      throw new ValidationError(
        `Unsupported file MIME type '${mimeType}'. Allowed types: PDF, JPEG, PNG.`
      );
    }
  }

  async upload(
    fileBuffer: Buffer | Uint8Array,
    filename: string,
    mimeType: string,
    prefix = "resumes"
  ): Promise<StorageUploadResult> {
    this.assertSafeEnvironment();
    this.validateUploadInput(fileBuffer, mimeType);

    const sanitized = this.sanitizeFilename(filename);
    const uniqueId = crypto.randomUUID();
    const datePrefix = new Date().toISOString().slice(0, 10);
    const safePrefix = this.sanitizeFilename(prefix);
    const storageKey = `${safePrefix}/${datePrefix}/${uniqueId}_${sanitized}`;

    const fullPath = this.resolveSafePath(storageKey);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, Buffer.from(fileBuffer));

    const metaPath = `${fullPath}.meta.json`;
    await fs.writeFile(
      metaPath,
      JSON.stringify(
        {
          originalFilename: sanitized,
          mimeType,
          sizeBytes: fileBuffer.byteLength,
          uploadedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return {
      storageKey,
      filename: sanitized,
      mimeType,
      sizeBytes: fileBuffer.byteLength,
    };
  }

  async get(storageKey: string): Promise<StorageGetResult | null> {
    this.assertSafeEnvironment();

    try {
      const fullPath = this.resolveSafePath(storageKey);
      const buffer = await fs.readFile(fullPath);
      let mimeType = "application/octet-stream";
      let filename = path.basename(fullPath);

      try {
        const metaRaw = await fs.readFile(`${fullPath}.meta.json`, "utf-8");
        const meta = JSON.parse(metaRaw);
        if (meta.mimeType) mimeType = meta.mimeType;
        if (meta.originalFilename) filename = meta.originalFilename;
      } catch {
        if (fullPath.endsWith(".pdf")) mimeType = "application/pdf";
      }

      return {
        buffer,
        mimeType,
        filename,
      };
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    this.assertSafeEnvironment();

    try {
      const fullPath = this.resolveSafePath(storageKey);
      await fs.unlink(fullPath);
      await fs.unlink(`${fullPath}.meta.json`).catch(() => {});
    } catch {
      // Ignore if file doesn't exist or path is invalid
    }
  }

  private signPayload(storageKey: string, expiresAtMs: number): string {
    return crypto
      .createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(`${storageKey}:${expiresAtMs}`)
      .digest("hex");
  }

  /**
   * Generates a time-limited HMAC-SHA256 signed download URL (default 15 minutes).
   */
  async getDownloadUrl(
    storageKey: string,
    expiresInSeconds = 900,
    nowMs = Date.now()
  ): Promise<string> {
    const expiresAtMs = nowMs + expiresInSeconds * 1000;
    const signature = this.signPayload(storageKey, expiresAtMs);
    return `/api/documents/download?key=${encodeURIComponent(
      storageKey
    )}&exp=${expiresAtMs}&sig=${signature}`;
  }

  /**
   * Verifies that a signed download URL token has not been tampered with and has not expired.
   */
  public verifySignedDownloadUrl(
    storageKey: string,
    expiresAtMs: number,
    signature: string,
    nowMs = Date.now()
  ): boolean {
    if (!storageKey || !signature || !Number.isFinite(expiresAtMs)) {
      return false;
    }
    if (nowMs > expiresAtMs) {
      return false;
    }
    const expected = this.signPayload(storageKey, expiresAtMs);
    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }
}
