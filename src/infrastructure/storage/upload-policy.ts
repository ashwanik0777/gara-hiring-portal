/**
 * Upload limits shared by every storage provider and the virus scanner, so the size the
 * storage layer accepts and the size the scanner streams can never drift apart.
 */
export const ALLOWED_PRIVATE_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const MAX_PRIVATE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Leading bytes ("magic numbers") each allowed type must start with. The declared MIME type
 * comes from the client and is trivially spoofed, so the content itself is checked.
 */
const FILE_SIGNATURES: ReadonlyMap<string, readonly Buffer[]> = new Map([
  // "%PDF-"
  ["application/pdf", [Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])]],
  // JPEG start-of-image marker followed by the next marker prefix
  ["image/jpeg", [Buffer.from([0xff, 0xd8, 0xff])]],
  // PNG 8-byte signature
  ["image/png", [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]],
]);

/**
 * True when the file content starts with a signature of the declared MIME type.
 * Unknown MIME types never match.
 */
export function matchesFileSignature(
  fileBuffer: Buffer | Uint8Array,
  mimeType: string
): boolean {
  const signatures = FILE_SIGNATURES.get(mimeType);
  if (!signatures) {
    return false;
  }
  const content = Buffer.from(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
  return signatures.some(
    (signature) =>
      content.byteLength >= signature.byteLength &&
      content.subarray(0, signature.byteLength).equals(signature)
  );
}
