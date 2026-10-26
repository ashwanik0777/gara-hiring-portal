// @vitest-environment node
// (jose, used for Better Auth's internal tokens, rejects jsdom's typed arrays.)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * End-to-end emailed-code flows through the real Better Auth pipeline (src/lib/auth/auth.ts:
 * plugins, hooks, disabled paths, database hooks) on Better Auth's in-memory adapter. Emails
 * are captured instead of sent; codes are read from the captured email, as a user would.
 */

type Row = Record<string, unknown>;

const { memoryDb, sentEmails, afterTasks } = vi.hoisted(() => ({
  memoryDb: {} as Record<string, Row[]>,
  sentEmails: [] as Array<{ to: string; subject: string; text: string; html?: string }>,
  afterTasks: [] as Array<() => Promise<void>>,
}));

vi.mock("better-auth/adapters/prisma", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { prismaAdapter: () => memoryAdapter(memoryDb) };
});

// The app's own Prisma calls (database hooks, email lookup) read and write the same tables.
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        memoryDb.user.find((row) => row.email === where.email) ?? null
      ),
    },
    twoFactor: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `tf-${memoryDb.twoFactor.length + 1}`, verified: true, failedVerificationCount: 0, lockedUntil: null, ...data };
        memoryDb.twoFactor.push(row);
        return row;
      }),
    },
    candidateProfile: {
      upsert: vi.fn(async ({ create }: { create: Row }) => {
        memoryDb.candidateProfile.push(create);
        return create;
      }),
    },
  },
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => {
    afterTasks.push(task);
  },
}));

vi.mock("@/infrastructure/email/outbox-processor", () => ({
  NodemailerEmailAdapter: class {
    async sendEmail(message: { to: string; subject: string; text: string; html?: string }) {
      sentEmails.push(message);
    }
  },
}));

import { auth } from "@/lib/auth/auth";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "Strong-Pass-123!";

/** Runs the work scheduled after the response (email delivery). */
async function flushAfterResponse(): Promise<void> {
  while (afterTasks.length > 0) {
    const task = afterTasks.shift();
    await task?.();
  }
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = ""] = header.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
  }

  header(): string {
    return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function post(path: string, body: unknown, jar?: CookieJar): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: ORIGIN };
  if (jar) headers.cookie = jar.header();
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) })
  );
  jar?.store(response);
  return response;
}

function cookieNames(response: Response): string[] {
  return response.headers.getSetCookie().map((cookie) => cookie.split("=")[0] ?? "");
}

function lastEmailedCode(): string {
  const text = sentEmails.at(-1)?.text ?? "";
  const match = /verification code is: (\d{6})/.exec(text);
  if (!match?.[1]) throw new Error("No code was emailed");
  return match[1];
}

function wrongCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

async function signUp(email: string, extra: Row = {}): Promise<Response> {
  const response = await post("/sign-up/email", { name: "Test Candidate", email, password: PASSWORD, ...extra });
  await flushAfterResponse();
  return response;
}

/** Signs up and verifies, leaving a verified account (and its session) behind. */
async function verifiedAccount(email: string): Promise<void> {
  await signUp(email);
  await post("/email-otp/verify-email", { email, otp: lastEmailedCode() });
}

let consoleOutput: string[] = [];

beforeEach(() => {
  for (const model of ["user", "session", "account", "verification", "twoFactor", "rateLimit", "candidateProfile"]) {
    memoryDb[model] = [];
  }
  sentEmails.length = 0;
  afterTasks.length = 0;
  consoleOutput = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg))).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sign-up email verification by emailed code", () => {
  it("creates an unverified account with the sign-in code on, its lockout row and candidate profile, and emails a hashed code", async () => {
    const email = "new.candidate@example.test";
    const response = await signUp(email, { careerInterest: "INTERNSHIP" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: null });
    expect(cookieNames(response)).not.toContain("better-auth.session_token");

    const [user] = memoryDb.user;
    expect(user).toMatchObject({ email, emailVerified: false, twoFactorEnabled: true });
    expect(memoryDb.twoFactor).toEqual([
      expect.objectContaining({ userId: user?.id, backupCodes: "[]", secret: expect.any(String) }),
    ]);
    expect(memoryDb.candidateProfile).toEqual([{ userId: user?.id, careerInterest: "INTERNSHIP" }]);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({ to: email, subject: "Your GARA Innovation verification code" });
    const code = lastEmailedCode();
    const stored = memoryDb.verification.map((row) => String(row.value));
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toContain(code);
    expect(consoleOutput.join("\n")).not.toContain(code);
  });

  it("signs the user in with the right code and maps wrong and expired codes", async () => {
    const email = "verify.me@example.test";
    await signUp(email);
    const code = lastEmailedCode();

    const wrong = await post("/email-otp/verify-email", { email, otp: wrongCode(code) });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "INVALID_OTP" });

    const right = await post("/email-otp/verify-email", { email, otp: code });
    expect(right.status).toBe(200);
    expect(cookieNames(right)).toContain("better-auth.session_token");
    expect(memoryDb.user[0]).toMatchObject({ emailVerified: true });

    // Single use.
    const replay = await post("/email-otp/verify-email", { email, otp: code });
    expect(replay.status).toBe(400);

    const expiredEmail = "expired@example.test";
    await signUp(expiredEmail);
    const expiredCode = lastEmailedCode();
    for (const row of memoryDb.verification) row.expiresAt = new Date(Date.now() - 1000);
    const expired = await post("/email-otp/verify-email", { email: expiredEmail, otp: expiredCode });
    expect(await expired.json()).toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("stops accepting a code after 5 wrong attempts", async () => {
    const email = "guesser@example.test";
    await signUp(email);
    const code = lastEmailedCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post("/email-otp/verify-email", { email, otp: wrongCode(code) });
    }
    const blocked = await post("/email-otp/verify-email", { email, otp: code });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });

  it("answers resend requests identically and only emails accounts that still need verifying", async () => {
    await signUp("pending@example.test");
    await verifiedAccount("done@example.test");
    sentEmails.length = 0;

    const bodies: unknown[] = [];
    for (const email of ["pending@example.test", "done@example.test", "nobody@example.test"]) {
      const response = await post("/email-otp/send-verification-otp", { email, type: "email-verification" });
      expect(response.status).toBe(200);
      bodies.push(await response.json());
    }
    await flushAfterResponse();

    expect(bodies).toEqual([{ success: true }, { success: true }, { success: true }]);
    expect(sentEmails.map((message) => message.to)).toEqual(["pending@example.test"]);
  });

  it("returns the generic sign-up answer for an existing email without creating anything", async () => {
    await signUp("taken@example.test");
    const again = await signUp("taken@example.test");
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ token: null });
    expect(memoryDb.user).toHaveLength(1);
    expect(memoryDb.candidateProfile).toHaveLength(1);
  });
});

describe("Password sign-in always asks for the emailed code", () => {
  it("refuses an unverified account with EMAIL_NOT_VERIFIED and emails a fresh verification code", async () => {
    const email = "unverified@example.test";
    await signUp(email);
    sentEmails.length = 0;

    const response = await post("/sign-in/email", { email, password: PASSWORD });
    await flushAfterResponse();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(sentEmails).toHaveLength(1);
    // A wrong password never reveals the verification state.
    const wrong = await post("/sign-in/email", { email, password: "Wrong-Pass-123!" });
    expect(await wrong.json()).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
  });

  it("issues no session until the emailed code is verified, counts wrong codes and never trusts the device", async () => {
    const email = "member@example.test";
    await verifiedAccount(email);
    const sessionsBefore = memoryDb.session.length;
    const jar = new CookieJar();

    const signIn = await post("/sign-in/email", { email, password: PASSWORD }, jar);
    expect(signIn.status).toBe(200);
    expect(await signIn.json()).toEqual({ twoFactorRedirect: true, twoFactorMethods: ["otp"] });
    expect(memoryDb.session).toHaveLength(sessionsBefore);
    expect(jar.header()).toContain("better-auth.two_factor=");
    expect(jar.header()).not.toContain("better-auth.session_token=");

    const trusted = await post("/two-factor/send-otp", { trustDevice: true }, jar);
    expect(trusted.status).toBe(400);
    expect(await trusted.json()).toMatchObject({ code: "TRUSTED_DEVICE_NOT_SUPPORTED" });

    const sent = await post("/two-factor/send-otp", {}, jar);
    await flushAfterResponse();
    expect(sent.status).toBe(200);
    const code = lastEmailedCode();
    expect(sentEmails.at(-1)?.text).toContain("finish signing in");

    const wrong = await post("/two-factor/verify-otp", { code: wrongCode(code) }, jar);
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ code: "INVALID_CODE" });
    expect(memoryDb.twoFactor[0]).toMatchObject({ failedVerificationCount: 1 });

    const withTrust = await post("/two-factor/verify-otp", { code, trustDevice: true }, jar);
    expect(withTrust.status).toBe(400);

    const verified = await post("/two-factor/verify-otp", { code }, jar);
    expect(verified.status).toBe(200);
    expect(cookieNames(verified)).toContain("better-auth.session_token");
    expect(cookieNames(verified)).not.toContain("better-auth.trust_device");
    expect(memoryDb.session).toHaveLength(sessionsBefore + 1);
    expect(memoryDb.twoFactor[0]).toMatchObject({ failedVerificationCount: 0 });
    expect(consoleOutput.join("\n")).not.toContain(code);
  });

  it("asks again at the next sign-in (no trusted device survives)", async () => {
    const email = "again@example.test";
    await verifiedAccount(email);
    const first = new CookieJar();
    await post("/sign-in/email", { email, password: PASSWORD }, first);
    await post("/two-factor/send-otp", {}, first);
    await flushAfterResponse();
    await post("/two-factor/verify-otp", { code: lastEmailedCode() }, first);

    const second = await post("/sign-in/email", { email, password: PASSWORD }, first);
    expect(await second.json()).toMatchObject({ twoFactorRedirect: true });
  });
});

describe("Bypass endpoints are disabled", () => {
  it.each([
    "/sign-in/email-otp",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/forget-password/email-otp",
    "/email-otp/change-email",
    "/two-factor/enable",
    "/two-factor/disable",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/send-verification-email",
  ])("%s answers 404", async (path) => {
    const response = await post(path, { email: "member@example.test", otp: "123456", code: "123456", password: PASSWORD });
    expect(response.status).toBe(404);
  });

  it("does not create an account from an emailed code", async () => {
    await post("/email-otp/send-verification-otp", { email: "ghost@example.test", type: "sign-in" });
    await flushAfterResponse();
    const response = await post("/sign-in/email-otp", { email: "ghost@example.test", otp: "123456" });
    expect(response.status).toBe(404);
    expect(memoryDb.user).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });
});
