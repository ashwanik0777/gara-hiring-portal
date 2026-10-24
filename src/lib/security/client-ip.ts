import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Resolves the client IP address from proxy headers.
 *
 * Trust assumption: the deployment edge (Vercel, or a reverse proxy configured the
 * same way) overwrites `x-real-ip` / `x-forwarded-for` with the connecting client's
 * address. Behind a proxy that forwards client-supplied values unchanged, these
 * headers are spoofable and must be fixed at the proxy.
 */
export function getClientIp(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return null;
}

/**
 * Returns a keyed hash of the client IP so raw addresses are never stored.
 * The key is derived from BETTER_AUTH_SECRET with a purpose label, so the hash
 * cannot be reversed by enumerating the IPv4 space without the secret.
 */
export function hashClientIp(ip: string | null, purpose = "client-ip"): string {
  const value = ip ?? "unknown";
  return crypto
    .createHmac("sha256", `${purpose}:${env.BETTER_AUTH_SECRET}`)
    .update(value)
    .digest("hex");
}

/**
 * Convenience helper for rate limiting and audit logging.
 */
export function getClientIpHash(headers: Headers, purpose?: string): string {
  return hashClientIp(getClientIp(headers), purpose);
}
