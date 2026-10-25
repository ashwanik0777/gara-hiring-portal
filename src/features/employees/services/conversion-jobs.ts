import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import type { JobHandler } from "@/infrastructure/jobs/job-runner";
import { JOB_TYPES } from "@/features/automation/job-types";
import { applyAcceptedConversion } from "./conversion-service";

const ConversionEffectivePayloadSchema = z.object({ reviewId: z.string().uuid() });

/**
 * CONVERSION_EFFECTIVE: applies an accepted intern-to-full-time conversion on its effective
 * date. Idempotent (see `applyAcceptedConversion`): a conversion that already happened, an offer
 * that was withdrawn or declined, or an exited record leaves the job done without changes.
 * A run before the effective date (clock skew) throws, so the runner retries shortly after.
 */
const runConversionEffective: JobHandler = async (payload, context) => {
  const parsed = ConversionEffectivePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Invalid CONVERSION_EFFECTIVE payload");
  }

  const result = await prisma.$transaction((tx) =>
    applyAcceptedConversion(tx, parsed.data.reviewId, {
      now: context.now,
      actorId: null,
      actorRole: "SYSTEM",
    })
  );

  if (result.status === "NOT_YET_EFFECTIVE") {
    throw new Error("Conversion is not effective yet; retrying later");
  }
  if (result.status === "NOT_APPLICABLE") {
    logger.info("Conversion job skipped: the offer no longer applies", {
      jobId: context.jobId,
      reviewId: parsed.data.reviewId,
    });
  }
};

/** Handlers contributed by the employees module (wired into the automation registry). */
export const conversionJobHandlers: Record<string, JobHandler> = {
  [JOB_TYPES.CONVERSION_EFFECTIVE]: runConversionEffective,
};
