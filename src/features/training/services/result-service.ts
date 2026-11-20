import { CertificateStatus, Prisma, Role, TrainingEnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { getSiteUrl } from "@/lib/site-url";
import { certificatePdfGenerator } from "@/infrastructure/pdf/certificate-pdf-generator";
import { certificatePdfPayload, generateCertificateCode } from "@/features/certificates/services/certificate-service";
import { resultDecisionSchema } from "../learning-schemas";
import { computeTrainingProgress, resultBlockers } from "../progress";
import { queueTrainingResultEmail } from "../emails";
import { assertBatchStaff } from "./batch-staff-service";

/*
 * Final result of an Industrial Training enrollment (Phase 3B). Product-owner rules
 * (2026-11-20): a pass only when the auto-check shows every criterion met (no override), which
 * issues the TRAINING_COMPLETION certificate in the same transaction; a fail only after the
 * batch has ended. Both need complete records (attendance taken, submissions graded).
 */

export async function decideTrainingResult(user: AuthenticatedUser, raw: unknown, now: Date) {
  const parsed = resultDecisionSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid decision.");
  const input = parsed.data;

  const owner = await prisma.trainingEnrollment.findUnique({ where: { id: input.enrollmentId }, select: { batchId: true } });
  if (!owner) throw new NotFoundError("Enrollment not found");
  await assertBatchStaff(user, owner.batchId);

  const verificationCode = generateCertificateCode("TRAINING_COMPLETION", now);
  const qrPayloadUrl = `${getSiteUrl().replace(/\/+$/, "")}/verify/${verificationCode}`;

  return prisma.$transaction(async (tx) => {
    // Serialize decisions on this enrollment.
    await tx.$queryRaw`SELECT "id" FROM "training_enrollments" WHERE "id" = ${input.enrollmentId} FOR UPDATE`;
    const enrollment = await tx.trainingEnrollment.findUnique({
      where: { id: input.enrollmentId },
      select: {
        id: true,
        status: true,
        userId: true,
        user: { select: { name: true } },
        attendance: { select: { sessionId: true, present: true } },
        submissions: { select: { assignmentId: true, marks: true } },
        finalProject: { select: { status: true, title: true } },
        demoBookings: { select: { result: true } },
        certificate: { select: { id: true } },
        batch: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            program: { select: { title: true, track: { select: { name: true } } } },
            sessions: { select: { id: true, startsAt: true, status: true, attendanceTakenAt: true } },
            assignments: { select: { id: true, dueAt: true, maxMarks: true } },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundError("Enrollment not found");
    if (enrollment.status !== TrainingEnrollmentStatus.ACTIVE) {
      throw new ConflictError(
        enrollment.status === TrainingEnrollmentStatus.REFUND_REQUESTED
          ? "This student has a refund request open; decide it first."
          : "A result has already been recorded for this student."
      );
    }

    const progress = computeTrainingProgress({
      now,
      assignments: enrollment.batch.assignments,
      submissions: enrollment.submissions,
      sessions: enrollment.batch.sessions,
      attendance: enrollment.attendance,
      project: enrollment.finalProject,
      demos: enrollment.demoBookings,
    });
    const blockers = resultBlockers(input.result, progress, enrollment.batch, now);
    if (blockers.length > 0) throw new ConflictError(blockers.join(" "));

    const snapshot = {
      result: input.result,
      marksPercent: progress.marks.percent,
      marksObtained: progress.marks.obtained,
      marksMax: progress.marks.max,
      attendancePercent: progress.attendance.percent,
      classesCounted: progress.attendance.counted,
      projectStatus: progress.project.status,
      demoPassed: progress.demo.passed,
      criteria: { ...progress.criteria },
    } satisfies Prisma.InputJsonObject;

    const passed = input.result === "PASS";
    await tx.trainingEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: passed ? TrainingEnrollmentStatus.COMPLETED : TrainingEnrollmentStatus.FAILED,
        resultAt: now,
        resultById: user.id,
        resultNote: input.note ?? null,
        resultSnapshot: snapshot,
      },
    });

    let certificate: { id: string; verificationCode: string } | null = null;
    if (passed) {
      if (enrollment.certificate) throw new ConflictError("A certificate already exists for this enrollment.");
      const profile = await tx.candidateProfile.findUnique({
        where: { userId: enrollment.userId },
        select: { college: { select: { name: true } } },
      });
      const details = {
        type: "TRAINING_COMPLETION" as const,
        recipientName: enrollment.user.name,
        programmeTitle: enrollment.batch.program.title,
        issueDate: now,
        completionDate: now,
        verificationCode,
        qrPayloadUrl,
        signatoryName: input.signatoryName ?? "",
        signatoryTitle: input.signatoryTitle ?? "",
        secondSignatoryName: input.secondSignatoryName ?? null,
        secondSignatoryTitle: input.secondSignatoryTitle ?? null,
        collegeName: profile?.college?.name ?? null,
        domain: enrollment.batch.program.track?.name ?? null,
        periodStart: enrollment.batch.startDate,
        projectTitle: enrollment.finalProject?.title ?? null,
        grade: input.grade ?? null,
      };
      // Render once so a generator failure blocks the result instead of issuing an unusable record.
      await certificatePdfGenerator.generateCertificatePdf(certificatePdfPayload(details));
      certificate = await tx.certificate.create({
        data: { ...details, trainingEnrollmentId: enrollment.id, status: CertificateStatus.ACTIVE, versionNumber: 1, issuedById: user.id },
        select: { id: true, verificationCode: true },
      });
    }

    const actorRole = user.roles.includes(Role.ADMIN) ? Role.ADMIN : Role.MENTOR;
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole,
        action: passed ? "TRAINING_RESULT_PASSED" : "TRAINING_RESULT_FAILED",
        resourceType: "TrainingEnrollment",
        resourceId: enrollment.id,
        diffPayload: { ...snapshot, note: input.note ?? null },
      },
    });
    if (certificate) {
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole,
          action: "CERTIFICATE_ISSUED",
          resourceType: "Certificate",
          resourceId: certificate.id,
          diffPayload: { trainingEnrollmentId: enrollment.id, verificationCode: certificate.verificationCode, type: "TRAINING_COMPLETION" },
        },
      });
    }
    await queueTrainingResultEmail(tx, enrollment.id, now);
    return { status: passed ? "COMPLETED" : "FAILED", certificate };
  });
}
