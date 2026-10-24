import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";

export interface RateLimitPolicy {
  scope: string;
  maxRequests: number;
  windowSeconds: number;
}

export const RATE_LIMIT_POLICIES: Record<
  | "LOGIN"
  | "REGISTER"
  | "FORGOT_PASSWORD"
  | "CERTIFICATE_VERIFY"
  | "FILE_UPLOAD"
  | "CHATBOT"
  | "APPLICATION_SUBMIT"
  | "VISITOR_TRACK",
  RateLimitPolicy
> = {
  LOGIN: { scope: "auth:login", maxRequests: 5, windowSeconds: 15 * 60 },
  REGISTER: { scope: "auth:register", maxRequests: 3, windowSeconds: 60 * 60 },
  FORGOT_PASSWORD: {
    scope: "auth:forgot_password",
    maxRequests: 3,
    windowSeconds: 60 * 60,
  },
  CERTIFICATE_VERIFY: {
    scope: "public:verify_certificate",
    maxRequests: 30,
    windowSeconds: 60,
  },
  FILE_UPLOAD: {
    scope: "storage:file_upload",
    maxRequests: 10,
    windowSeconds: 60,
  },
  CHATBOT: {
    scope: "portal:chatbot",
    maxRequests: 20,
    windowSeconds: 60,
  },
  APPLICATION_SUBMIT: {
    scope: "public:application_submit",
    maxRequests: 5,
    windowSeconds: 60 * 60,
  },
  VISITOR_TRACK: {
    scope: "public:visitor_track",
    maxRequests: 10,
    windowSeconds: 60 * 60,
  },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Replaceable rate-limit store contract suitable for multi-instance production
 * (PostgreSQL shared table or Redis/Upstash adapter).
 */
export interface RateLimitStore {
  checkAndConsume(
    identifier: string,
    policy: RateLimitPolicy,
    nowMs?: number
  ): Promise<RateLimitResult>;
}

/**
 * Distributed PostgreSQL-backed rate limit store for multi-instance deployments.
 * Uses the `verifications` table with `RL:<scope>:<actor>` identifiers and TTL expiration
 * so rate-limit state is shared across all horizontal Node.js instances.
 *
 * The purge → count → insert sequence runs inside one transaction guarded by a
 * transaction-scoped advisory lock on the key, so concurrent requests for the same
 * actor are serialized and cannot all pass the check before any of them records a hit.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  public async checkAndConsume(
    identifier: string,
    policy: RateLimitPolicy,
    nowMs = Date.now()
  ): Promise<RateLimitResult> {
    const key = `RL:${policy.scope}:${identifier}`;
    const now = new Date(nowMs);
    const expiresAt = new Date(nowMs + policy.windowSeconds * 1000);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

      // 1. Purge expired entries for this key
      await tx.verification.deleteMany({
        where: {
          identifier: key,
          expiresAt: { lte: now },
        },
      });

      // 2. Count active hits within the current window
      const activeHits = await tx.verification.findMany({
        where: {
          identifier: key,
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: "asc" },
        select: { expiresAt: true },
      });

      if (activeHits.length >= policy.maxRequests) {
        const oldestExpiry = activeHits[0]?.expiresAt.getTime() ?? expiresAt.getTime();
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldestExpiry - nowMs) / 1000)
        );
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds,
        };
      }

      // 3. Record this hit with a unique token value
      await tx.verification.create({
        data: {
          identifier: key,
          value: crypto.randomUUID(),
          expiresAt,
        },
      });

      return {
        allowed: true,
        remaining: Math.max(0, policy.maxRequests - (activeHits.length + 1)),
        retryAfterSeconds: 0,
      };
    });
  }
}

/**
 * Deterministic sliding-window store for isolated unit tests or fallback mode.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  public async checkAndConsume(
    identifier: string,
    policy: RateLimitPolicy,
    nowMs = Date.now()
  ): Promise<RateLimitResult> {
    const key = `RL:${policy.scope}:${identifier}`;
    const windowMs = policy.windowSeconds * 1000;
    const existing = (this.hits.get(key) ?? []).filter(
      (expiryMs) => expiryMs > nowMs
    );

    if (existing.length >= policy.maxRequests) {
      this.hits.set(key, existing);
      const oldestExpiry = existing[0] ?? nowMs + windowMs;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestExpiry - nowMs) / 1000)
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    existing.push(nowMs + windowMs);
    this.hits.set(key, existing);

    return {
      allowed: true,
      remaining: Math.max(0, policy.maxRequests - existing.length),
      retryAfterSeconds: 0,
    };
  }
}

export class RateLimiter {
  private readonly primaryStore: RateLimitStore;
  private readonly fallbackStore: RateLimitStore;

  constructor(
    primaryStore: RateLimitStore = new PostgresRateLimitStore(),
    fallbackStore: RateLimitStore = new MemoryRateLimitStore()
  ) {
    this.primaryStore = primaryStore;
    this.fallbackStore = fallbackStore;
  }

  public async enforce(
    identifier: string,
    policy: RateLimitPolicy,
    nowMs = Date.now()
  ): Promise<RateLimitResult> {
    let result: RateLimitResult;
    try {
      result = await this.primaryStore.checkAndConsume(
        identifier,
        policy,
        nowMs
      );
    } catch {
      result = await this.fallbackStore.checkAndConsume(
        identifier,
        policy,
        nowMs
      );
    }

    if (!result.allowed) {
      throw new RateLimitError(
        result.retryAfterSeconds,
        `Rate limit exceeded for ${policy.scope}. Please retry in ${result.retryAfterSeconds} seconds.`
      );
    }

    return result;
  }
}

export const defaultRateLimiter = new RateLimiter();
