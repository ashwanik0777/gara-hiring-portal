import net from "node:net";
import { env } from "@/lib/env";
import { AppError, ValidationError } from "@/lib/errors";
import { MAX_PRIVATE_UPLOAD_BYTES } from "./upload-policy";

export type VirusScanResult =
  | { clean: true }
  | { clean: false; signature: string };

/**
 * Scans file content before it is stored. Implementations resolve with a verdict and
 * reject with VirusScanFailedError when no verdict could be obtained.
 */
export interface VirusScanner {
  scan(content: Buffer | Uint8Array): Promise<VirusScanResult>;
}

export type VirusScanFailureReason =
  | "unreachable"
  | "timeout"
  | "scanner_error"
  | "protocol_error";

/**
 * Internal failure: the scanner could not produce a verdict. Callers must fail closed
 * (refuse the file). The message may contain daemon details, so it is for logs only.
 */
export class VirusScanFailedError extends Error {
  public readonly reason: VirusScanFailureReason;

  constructor(reason: VirusScanFailureReason, message: string) {
    super(message);
    this.name = "VirusScanFailedError";
    this.reason = reason;
  }
}

/** User-facing message for content the scanner flagged. */
export const INFECTED_UPLOAD_MESSAGE =
  "This file can't be accepted because it may be unsafe.";

/** User-facing message when the scanner is unavailable and the upload is refused. */
export const SCAN_UNAVAILABLE_MESSAGE =
  "We couldn't check your file for safety right now. Please try again later.";

/**
 * Operational 503 raised by the storage layer when an upload is refused because it could
 * not be scanned (fail closed). Safe to show to the user.
 */
export class VirusScanUnavailableError extends AppError {
  constructor(message = SCAN_UNAVAILABLE_MESSAGE) {
    super(message, "VIRUS_SCAN_UNAVAILABLE", 503);
  }
}

const INSTREAM_COMMAND = Buffer.from("zINSTREAM\0", "ascii");
const DEFAULT_CHUNK_BYTES = 64 * 1024;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
// clamd replies with one short line; anything longer is not a clamd reply.
const MAX_RESPONSE_BYTES = 4 * 1024;

/**
 * Splits content into clamd INSTREAM frames: each chunk is prefixed with its length as a
 * 4-byte unsigned big-endian integer, and the stream ends with a zero-length frame.
 */
export function encodeInstreamFrames(
  content: Buffer | Uint8Array,
  chunkBytes = DEFAULT_CHUNK_BYTES
): Buffer[] {
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new RangeError("chunkBytes must be a positive integer.");
  }
  const data = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  const frames: Buffer[] = [];
  for (let offset = 0; offset < data.byteLength; offset += chunkBytes) {
    const chunk = data.subarray(offset, Math.min(offset + chunkBytes, data.byteLength));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(chunk.byteLength, 0);
    frames.push(Buffer.concat([header, chunk]));
  }
  frames.push(Buffer.alloc(4)); // zero-length terminator
  return frames;
}

/**
 * Parses a clamd reply such as "stream: OK", "stream: Eicar-Signature FOUND" or
 * "INSTREAM size limit exceeded. ERROR". Throws VirusScanFailedError for errors and
 * anything unrecognised, so an unexpected reply never counts as clean.
 */
export function parseClamdResponse(raw: string): VirusScanResult {
  const reply = raw.replace(/\0/g, "").trim();

  if (/^[^:]*:\s*OK$/.test(reply)) {
    return { clean: true };
  }

  const found = /^[^:]*:\s*(.+?)\s+FOUND$/.exec(reply);
  if (found) {
    return { clean: false, signature: found[1] };
  }

  if (/\bERROR$/.test(reply)) {
    throw new VirusScanFailedError("scanner_error", `clamd reported an error: ${reply}`);
  }

  throw new VirusScanFailedError(
    "protocol_error",
    `Unrecognised clamd reply: ${reply.slice(0, 200) || "(empty)"}`
  );
}

export interface ClamdVirusScannerOptions {
  host: string;
  port: number;
  /** Time allowed to establish the TCP connection. */
  connectTimeoutMs?: number;
  /** Time allowed for the whole scan, from connecting to receiving the verdict. */
  scanTimeoutMs?: number;
  /** Payload bytes per INSTREAM frame. */
  chunkBytes?: number;
  /** Largest file streamed; matches the storage upload limit. */
  maxBytes?: number;
}

/**
 * Scans content with a ClamAV daemon (clamd) using the INSTREAM command over TCP.
 * Fails closed: connection failures, timeouts, daemon errors and unparseable replies all
 * reject with VirusScanFailedError instead of resolving as clean.
 */
export class ClamdVirusScanner implements VirusScanner {
  private readonly host: string;
  private readonly port: number;
  private readonly connectTimeoutMs: number;
  private readonly scanTimeoutMs: number;
  private readonly chunkBytes: number;
  private readonly maxBytes: number;

  constructor(options: ClamdVirusScannerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.scanTimeoutMs = options.scanTimeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
    this.chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
    this.maxBytes = options.maxBytes ?? MAX_PRIVATE_UPLOAD_BYTES;
  }

  async scan(content: Buffer | Uint8Array): Promise<VirusScanResult> {
    if (content.byteLength > this.maxBytes) {
      throw new ValidationError(
        `Uploaded file exceeds the maximum allowed size of ${this.maxBytes / (1024 * 1024)} MB.`
      );
    }
    const frames = encodeInstreamFrames(content, this.chunkBytes);

    return new Promise<VirusScanResult>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const responseChunks: Buffer[] = [];
      let responseBytes = 0;
      let connected = false;
      let settled = false;

      const settle = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        clearTimeout(scanTimer);
        socket.destroy();
        outcome();
      };
      const fail = (reason: VirusScanFailureReason, message: string) =>
        settle(() => reject(new VirusScanFailedError(reason, message)));
      const finishWithReply = () => {
        const reply = Buffer.concat(responseChunks).toString("utf8");
        settle(() => {
          try {
            resolve(parseClamdResponse(reply));
          } catch (err) {
            reject(err);
          }
        });
      };

      const connectTimer = setTimeout(
        () =>
          fail(
            "unreachable",
            `Timed out connecting to clamd at ${this.host}:${this.port} after ${this.connectTimeoutMs} ms.`
          ),
        this.connectTimeoutMs
      );
      const scanTimer = setTimeout(
        () => fail("timeout", `clamd did not return a verdict within ${this.scanTimeoutMs} ms.`),
        this.scanTimeoutMs
      );

      const writeFrame = (frame: Buffer) =>
        new Promise<void>((done) => {
          if (socket.write(frame)) {
            done();
          } else {
            socket.once("drain", done);
          }
        });

      socket.once("connect", () => {
        connected = true;
        clearTimeout(connectTimer);
        void (async () => {
          await writeFrame(INSTREAM_COMMAND);
          for (const frame of frames) {
            if (settled) return;
            await writeFrame(frame);
          }
        })();
      });

      socket.on("data", (chunk: Buffer) => {
        responseBytes += chunk.byteLength;
        if (responseBytes > MAX_RESPONSE_BYTES) {
          fail("protocol_error", "clamd reply exceeded the expected size.");
          return;
        }
        responseChunks.push(chunk);
        // With the "z" command prefix clamd terminates its reply with a NUL byte.
        if (chunk.includes(0)) {
          finishWithReply();
        }
      });

      socket.on("end", () => {
        if (responseBytes > 0) {
          finishWithReply();
        } else {
          fail("protocol_error", "clamd closed the connection without a verdict.");
        }
      });

      socket.on("error", (err: NodeJS.ErrnoException) => {
        // clamd may reply (e.g. "size limit exceeded") and reset the connection while we
        // are still streaming; a reply that already arrived takes precedence.
        if (responseBytes > 0) {
          finishWithReply();
          return;
        }
        fail(
          connected ? "protocol_error" : "unreachable",
          `clamd connection to ${this.host}:${this.port} failed: ${err.code ?? err.message}`
        );
      });

      socket.on("close", () => {
        if (responseBytes > 0) {
          finishWithReply();
        } else {
          fail("protocol_error", "clamd closed the connection without a verdict.");
        }
      });
    });
  }
}

/**
 * The scanner selected by VIRUS_SCAN_MODE: clamd for "clamav", none for "off".
 */
export function createVirusScannerFromEnv(): VirusScanner | null {
  if (env.VIRUS_SCAN_MODE === "clamav") {
    return new ClamdVirusScanner({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
  }
  return null;
}
