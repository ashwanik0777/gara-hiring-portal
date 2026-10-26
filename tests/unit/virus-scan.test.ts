// @vitest-environment node
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClamdVirusScanner,
  encodeInstreamFrames,
  INFECTED_UPLOAD_MESSAGE,
  parseClamdResponse,
  SCAN_UNAVAILABLE_MESSAGE,
  VirusScanFailedError,
  VirusScanner,
  VirusScanUnavailableError,
} from "@/infrastructure/storage/virus-scanner";
import {
  MAX_PRIVATE_UPLOAD_BYTES,
  matchesFileSignature,
} from "@/infrastructure/storage/upload-policy";
import { LocalStorageService } from "@/infrastructure/storage/local-storage-service";
import { toActionError, ValidationError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Fake clamd: speaks the INSTREAM protocol on an ephemeral port
// ---------------------------------------------------------------------------

interface ReceivedStream {
  command: string;
  frameLengths: number[];
  content: Buffer;
  terminated: boolean;
}

type FakeBehaviour =
  | { kind: "reply"; reply: (content: Buffer) => string }
  | { kind: "hang" }
  | { kind: "size-limit"; maxStreamBytes: number };

interface FakeClamd {
  port: number;
  connections: number;
  streams: ReceivedStream[];
  close(): Promise<void>;
}

const MALWARE_MARKER = "FAKE-MALWARE-MARKER";

const defaultReply = (content: Buffer) =>
  content.includes(MALWARE_MARKER) ? "stream: Fake.Test-Signature FOUND" : "stream: OK";

async function startFakeClamd(
  behaviour: FakeBehaviour = { kind: "reply", reply: defaultReply }
): Promise<FakeClamd> {
  const sockets = new Set<net.Socket>();
  const state: FakeClamd = {
    port: 0,
    connections: 0,
    streams: [],
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };

  const server = net.createServer((socket) => {
    state.connections += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});

    let pending = Buffer.alloc(0);
    const stream: ReceivedStream = {
      command: "",
      frameLengths: [],
      content: Buffer.alloc(0),
      terminated: false,
    };
    state.streams.push(stream);
    let commandRead = false;
    let replied = false;

    socket.on("data", (chunk: Buffer) => {
      if (replied) return;
      pending = Buffer.concat([pending, chunk]);

      if (!commandRead) {
        const nul = pending.indexOf(0);
        if (nul === -1) return;
        stream.command = pending.subarray(0, nul).toString("ascii");
        pending = pending.subarray(nul + 1);
        commandRead = true;
      }

      while (!stream.terminated && pending.byteLength >= 4) {
        const length = pending.readUInt32BE(0);
        if (length === 0) {
          stream.terminated = true;
          pending = pending.subarray(4);
          break;
        }
        if (pending.byteLength < 4 + length) break;
        stream.frameLengths.push(length);
        stream.content = Buffer.concat([stream.content, pending.subarray(4, 4 + length)]);
        pending = pending.subarray(4 + length);

        if (
          behaviour.kind === "size-limit" &&
          stream.content.byteLength > behaviour.maxStreamBytes
        ) {
          replied = true;
          socket.end("INSTREAM size limit exceeded. ERROR\0");
          return;
        }
      }

      if (stream.terminated && behaviour.kind === "reply") {
        replied = true;
        socket.end(`${behaviour.reply(stream.content)}\0`);
      }
      // "hang": never answer
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  state.port = (server.address() as net.AddressInfo).port;
  return state;
}

/** A port that nothing listens on (bound once, then released). */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("IHDR-sample"),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("JFIF")]);

let fake: FakeClamd | null = null;

afterEach(async () => {
  await fake?.close();
  fake = null;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Protocol helpers
// ---------------------------------------------------------------------------

describe("clamd INSTREAM framing", () => {
  it("prefixes every chunk with a 4-byte big-endian length and ends with a zero-length frame", () => {
    const content = Buffer.alloc(2_500, 0x41);
    const frames = encodeInstreamFrames(content, 1_000);

    expect(frames).toHaveLength(4);
    expect(frames.slice(0, 3).map((frame) => frame.readUInt32BE(0))).toEqual([1_000, 1_000, 500]);
    // Big-endian: 1000 = 0x000003E8
    expect([...frames[0].subarray(0, 4)]).toEqual([0x00, 0x00, 0x03, 0xe8]);
    expect(frames[3].equals(Buffer.alloc(4))).toBe(true);
    expect(Buffer.concat(frames.slice(0, 3).map((frame) => frame.subarray(4))).equals(content)).toBe(
      true
    );
  });

  it("sends only the terminator for empty content and rejects invalid chunk sizes", () => {
    expect(encodeInstreamFrames(Buffer.alloc(0))).toEqual([Buffer.alloc(4)]);
    expect(() => encodeInstreamFrames(PDF_BYTES, 0)).toThrow(RangeError);
  });

  it("streams the exact content in chunked frames to clamd", async () => {
    fake = await startFakeClamd();
    const scanner = new ClamdVirusScanner({ host: "127.0.0.1", port: fake.port, chunkBytes: 1_000 });
    const content = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2_491, 0x20)]);

    await expect(scanner.scan(content)).resolves.toEqual({ clean: true });

    expect(fake.streams).toHaveLength(1);
    const [stream] = fake.streams;
    expect(stream.command).toBe("zINSTREAM");
    expect(stream.frameLengths).toEqual([1_000, 1_000, 500]);
    expect(stream.terminated).toBe(true);
    expect(stream.content.equals(content)).toBe(true);
  });
});

describe("clamd reply parsing", () => {
  it("recognises OK, FOUND and ERROR replies", () => {
    expect(parseClamdResponse("stream: OK\0")).toEqual({ clean: true });
    expect(parseClamdResponse("stream: Win.Test.EICAR_HDB-1 FOUND\0")).toEqual({
      clean: false,
      signature: "Win.Test.EICAR_HDB-1",
    });
    expect(() => parseClamdResponse("INSTREAM size limit exceeded. ERROR\0")).toThrow(
      expect.objectContaining({ reason: "scanner_error" })
    );
  });

  it("never treats an empty or unrecognised reply as clean", () => {
    expect(() => parseClamdResponse("")).toThrow(VirusScanFailedError);
    expect(() => parseClamdResponse("PONG")).toThrow(
      expect.objectContaining({ reason: "protocol_error" })
    );
    expect(() => parseClamdResponse("stream: OK, probably")).toThrow(VirusScanFailedError);
  });
});

// ---------------------------------------------------------------------------
// Scanner against a fake daemon
// ---------------------------------------------------------------------------

describe("ClamdVirusScanner", () => {
  it("reports clean content", async () => {
    fake = await startFakeClamd();
    const scanner = new ClamdVirusScanner({ host: "127.0.0.1", port: fake.port });

    await expect(scanner.scan(PDF_BYTES)).resolves.toEqual({ clean: true });
  });

  it("reports infected content with the signature name", async () => {
    fake = await startFakeClamd();
    const scanner = new ClamdVirusScanner({ host: "127.0.0.1", port: fake.port });

    await expect(
      scanner.scan(Buffer.from(`%PDF-1.4 ${MALWARE_MARKER}`))
    ).resolves.toEqual({ clean: false, signature: "Fake.Test-Signature" });
  });

  it("fails closed when clamd is unreachable", async () => {
    const port = await closedPort();
    const scanner = new ClamdVirusScanner({ host: "127.0.0.1", port, connectTimeoutMs: 2_000 });

    await expect(scanner.scan(PDF_BYTES)).rejects.toMatchObject({
      name: "VirusScanFailedError",
      reason: "unreachable",
    });
  });

  it("fails closed when clamd does not answer in time", async () => {
    fake = await startFakeClamd({ kind: "hang" });
    const scanner = new ClamdVirusScanner({
      host: "127.0.0.1",
      port: fake.port,
      scanTimeoutMs: 200,
    });

    const startedAt = Date.now();
    await expect(scanner.scan(PDF_BYTES)).rejects.toMatchObject({ reason: "timeout" });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("refuses oversized content without contacting clamd", async () => {
    fake = await startFakeClamd();
    const scanner = new ClamdVirusScanner({ host: "127.0.0.1", port: fake.port });

    await expect(scanner.scan(Buffer.alloc(MAX_PRIVATE_UPLOAD_BYTES + 1))).rejects.toThrow(
      ValidationError
    );
    expect(fake.connections).toBe(0);
  });

  it("fails closed when clamd rejects the stream as too large", async () => {
    fake = await startFakeClamd({ kind: "size-limit", maxStreamBytes: 1_024 });
    const scanner = new ClamdVirusScanner({
      host: "127.0.0.1",
      port: fake.port,
      chunkBytes: 512,
    });

    await expect(scanner.scan(Buffer.alloc(256 * 1024, 0x20))).rejects.toMatchObject({
      reason: "scanner_error",
    });
  });

  it("fails closed when clamd closes the connection without a verdict", async () => {
    fake = await startFakeClamd({ kind: "reply", reply: () => "" });
    const scanner = new ClamdVirusScanner({ host: "127.0.0.1", port: fake.port });

    await expect(scanner.scan(PDF_BYTES)).rejects.toBeInstanceOf(VirusScanFailedError);
  });
});

// ---------------------------------------------------------------------------
// Storage integration: scan before write, fail closed
// ---------------------------------------------------------------------------

describe("LocalStorageService upload scanning", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "gara-virus-scan-"));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  async function storedFiles(): Promise<string[]> {
    const entries = await fs.readdir(baseDir, { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  }

  it("stores a file that clamd reports as clean", async () => {
    fake = await startFakeClamd();
    const storage = new LocalStorageService(baseDir, {
      virusScanner: new ClamdVirusScanner({ host: "127.0.0.1", port: fake.port }),
    });

    const result = await storage.upload(PDF_BYTES, "resume.pdf", "application/pdf");
    const stored = await storage.get(result.storageKey);
    expect(stored?.buffer.equals(PDF_BYTES)).toBe(true);
    expect(fake.streams[0].content.equals(PDF_BYTES)).toBe(true);
  });

  it("rejects an infected file with a friendly message and writes nothing", async () => {
    fake = await startFakeClamd();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new LocalStorageService(baseDir, {
      virusScanner: new ClamdVirusScanner({ host: "127.0.0.1", port: fake.port }),
    });

    const upload = storage.upload(
      Buffer.from(`%PDF-1.4 ${MALWARE_MARKER}`),
      "resume.pdf",
      "application/pdf"
    );
    await expect(upload).rejects.toThrow(ValidationError);
    await expect(upload).rejects.toThrow(INFECTED_UPLOAD_MESSAGE);
    expect(await storedFiles()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Fake.Test-Signature"));
  });

  it("refuses the upload with a try-again message when clamd is unreachable", async () => {
    const port = await closedPort();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = new LocalStorageService(baseDir, {
      virusScanner: new ClamdVirusScanner({ host: "127.0.0.1", port }),
    });

    const upload = storage.upload(PDF_BYTES, "resume.pdf", "application/pdf");
    await expect(upload).rejects.toBeInstanceOf(VirusScanUnavailableError);
    await expect(upload).rejects.toMatchObject({ statusCode: 503 });
    expect(await storedFiles()).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("virus scan unavailable"));
    // Operational: the friendly message (not daemon details) reaches the user.
    const reason = await upload.catch((err: unknown) => err);
    expect(toActionError(reason)).toBe(SCAN_UNAVAILABLE_MESSAGE);
  });

  it("refuses the upload when clamd times out", async () => {
    fake = await startFakeClamd({ kind: "hang" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = new LocalStorageService(baseDir, {
      virusScanner: new ClamdVirusScanner({
        host: "127.0.0.1",
        port: fake.port,
        scanTimeoutMs: 200,
      }),
    });

    await expect(
      storage.upload(PDF_BYTES, "resume.pdf", "application/pdf")
    ).rejects.toBeInstanceOf(VirusScanUnavailableError);
    expect(await storedFiles()).toEqual([]);
  });

  it("skips scanning when no scanner is configured (VIRUS_SCAN_MODE=off)", async () => {
    const storage = new LocalStorageService(baseDir, { virusScanner: null });

    const result = await storage.upload(PNG_BYTES, "photo.png", "image/png");
    expect(result.mimeType).toBe("image/png");
    expect(await storedFiles()).toHaveLength(2); // file + metadata
  });
});

// ---------------------------------------------------------------------------
// File signatures (magic bytes) in the storage layer
// ---------------------------------------------------------------------------

describe("Storage file signature checks", () => {
  const storage = new LocalStorageService(path.join(os.tmpdir(), "gara-signature-unused"), {
    virusScanner: null,
  });

  it("accepts genuine PDF, JPEG and PNG content", () => {
    expect(matchesFileSignature(PDF_BYTES, "application/pdf")).toBe(true);
    expect(matchesFileSignature(JPEG_BYTES, "image/jpeg")).toBe(true);
    expect(matchesFileSignature(PNG_BYTES, "image/png")).toBe(true);
    expect(() => storage.validateUploadInput(JPEG_BYTES, "image/jpeg")).not.toThrow();
  });

  it("rejects content that does not match the declared type", () => {
    expect(matchesFileSignature(PDF_BYTES, "image/png")).toBe(false);
    expect(matchesFileSignature(Buffer.from("MZ\x90\x00 executable"), "application/pdf")).toBe(false);
    expect(matchesFileSignature(Buffer.from([0x89, 0x50]), "image/png")).toBe(false);
    expect(matchesFileSignature(PDF_BYTES, "constructor")).toBe(false);

    expect(() => storage.validateUploadInput(PDF_BYTES, "image/jpeg")).toThrow(ValidationError);
    expect(() =>
      storage.validateUploadInput(Buffer.from("<html><script>"), "application/pdf")
    ).toThrow(/does not match its type/);
  });

  it("checks the signature of a Uint8Array view at its own offset", () => {
    const backing = Buffer.concat([Buffer.from("junk"), PNG_BYTES]);
    const view = new Uint8Array(backing.buffer, backing.byteOffset + 4, PNG_BYTES.byteLength);
    expect(matchesFileSignature(view, "image/png")).toBe(true);
  });

  it("rejects a spoofed file before it is scanned", async () => {
    const scanner: VirusScanner = { scan: vi.fn().mockResolvedValue({ clean: true }) };
    const guarded = new LocalStorageService(path.join(os.tmpdir(), "gara-signature-unused"), {
      virusScanner: scanner,
    });

    await expect(
      guarded.upload(Buffer.from("MZ executable"), "resume.pdf", "application/pdf")
    ).rejects.toThrow(ValidationError);
    expect(scanner.scan).not.toHaveBeenCalled();
  });
});

describe("Scanner selection from VIRUS_SCAN_MODE", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });

  it("uses clamd at CLAMAV_HOST:CLAMAV_PORT in clamav mode and nothing in off mode", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: { VIRUS_SCAN_MODE: "clamav", CLAMAV_HOST: "clamd.internal", CLAMAV_PORT: 3310 },
    }));
    const clamav = await import("@/infrastructure/storage/virus-scanner");
    expect(clamav.createVirusScannerFromEnv()).toBeInstanceOf(clamav.ClamdVirusScanner);

    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: { VIRUS_SCAN_MODE: "off", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: 3310 },
    }));
    const off = await import("@/infrastructure/storage/virus-scanner");
    expect(off.createVirusScannerFromEnv()).toBeNull();
  });
});
