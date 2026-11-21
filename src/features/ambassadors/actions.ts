"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, type AuthenticatedUser } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { applyAsAmbassador, decideAmbassador, saveUpiId } from "./services/ambassador-service";
import { payViaRazorpayX, recordManualPayout, reviewCommissions } from "./services/commission-service";
import { issueAmbassadorCertificate } from "./services/ambassador-certificate";

type Result<T = null> = { success: true; data: T } | { success: false; error: string };

const APPLY_RATE_LIMIT: RateLimitPolicy = { scope: "ambassador:apply", maxRequests: 5, windowSeconds: 60 * 60 };

async function run<T>(fallback: string, work: (user: AuthenticatedUser, now: Date) => Promise<T>, paths: string[]): Promise<Result<T>> {
  try {
    const user = await requireAuth();
    const data = await work(user, new Date());
    for (const path of paths) revalidatePath(path);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toActionError(error, fallback) };
  }
}

export async function applyAsAmbassadorAction(input: unknown) {
  return run(
    "Your application could not be sent.",
    async (user) => {
      await defaultRateLimiter.enforce(user.id, APPLY_RATE_LIMIT);
      await applyAsAmbassador(user, input);
      return null;
    },
    ["/candidate/ambassador", "/admin/campus-ambassadors"]
  );
}

export async function saveUpiIdAction(input: unknown) {
  return run("The UPI ID could not be saved.", async (user) => saveUpiId(user, input), ["/candidate/ambassador"]);
}

export async function decideAmbassadorAction(input: unknown) {
  const result = await run("The decision could not be saved.", (user, now) => decideAmbassador(user, input, now).then(() => null), [
    "/admin/campus-ambassadors",
  ]);
  if (result.success) scheduleOutboxFlush();
  return result;
}

/** Approve or decline commissions after reviewing the ambassador's work (administrators). */
export async function reviewCommissionsAction(input: unknown) {
  return run(
    "The decision could not be saved.",
    (user, now) => reviewCommissions(user, input, now).then((result) => ({ count: result.count, amountPaise: result.amountPaise })),
    ["/admin/campus-ambassadors/payouts", "/admin/campus-ambassadors", "/candidate/ambassador"]
  );
}

export async function recordManualPayoutAction(input: unknown) {
  const result = await run("The payout could not be recorded.", (user, now) => recordManualPayout(user, input, now).then(() => null), [
    "/admin/campus-ambassadors/payouts",
  ]);
  if (result.success) scheduleOutboxFlush();
  return result;
}

export async function payViaRazorpayXAction(ambassadorId: string) {
  const result = await run(
    "The payout could not be sent.",
    (user, now) => payViaRazorpayX(user, z.uuid().parse(ambassadorId), now).then((payout) => ({ status: payout.status })),
    ["/admin/campus-ambassadors/payouts"]
  );
  if (result.success) scheduleOutboxFlush();
  return result;
}

export async function issueAmbassadorCertificateAction(input: unknown) {
  return run(
    "The certificate could not be issued.",
    (user, now) => issueAmbassadorCertificate(user, input, now).then((certificate) => ({ verificationCode: certificate.verificationCode })),
    ["/admin/campus-ambassadors", "/candidate/ambassador"]
  );
}
