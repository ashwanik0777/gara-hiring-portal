import crypto from "node:crypto";
import { env } from "@/lib/env";

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/**
 * True when the `Authorization` header carries `Bearer <CRON_SECRET>`. Both sides are hashed
 * to a fixed length first, so the comparison time reveals neither the secret nor its length.
 * Always false while CRON_SECRET is not configured (fail closed).
 */
export function hasCronSecret(authorizationHeader: string | null): boolean {
  if (!env.CRON_SECRET || !authorizationHeader) {
    return false;
  }
  return crypto.timingSafeEqual(digest(authorizationHeader), digest(`Bearer ${env.CRON_SECRET}`));
}
