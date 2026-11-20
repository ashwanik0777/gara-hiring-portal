import { cookies } from "next/headers";
import { after } from "next/server";
import { logger } from "@/lib/logging/logger";
import { REFERRAL_COOKIE } from "./policy";
import { attachReferralSignup } from "./services/ambassador-service";

/**
 * After the response: attributes the signed-in account to the ambassador in the referral
 * cookie (once; only accounts created inside the attribution window; never self-referral).
 */
export async function scheduleReferralAttribution(userId: string): Promise<void> {
  let code: string | undefined;
  try {
    code = (await cookies()).get(REFERRAL_COOKIE)?.value;
  } catch {
    return; // outside a request scope
  }
  if (!code) return;
  try {
    after(async () => {
      try {
        await attachReferralSignup(userId, code, new Date());
      } catch (error) {
        logger.warn("Referral attribution failed", { reason: error instanceof Error ? error.name : "unknown" });
      }
    });
  } catch {
    // Outside a request scope (tests): nothing to attribute.
  }
}
