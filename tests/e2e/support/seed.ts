import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  OpeningStatus,
  OpeningType,
  PrismaClient,
  Role,
  WorkplaceType,
  type Prisma,
} from "@prisma/client";
import { Pool } from "pg";
import { getDefaultApplicationFormSchema } from "../../../src/features/application-forms/default-form";
import {
  E2E_HR_PERMISSIONS,
  E2E_EXPIRED_OPENING,
  E2E_OPENINGS,
  E2E_STAFF_PASSWORD,
  E2E_TRAINING,
  E2E_USERS,
} from "./fixtures";

/**
 * Hashes a password exactly as Better Auth does. Playwright's TypeScript loader cannot load
 * the ESM-only `better-auth/crypto` module, so the hash is computed by a plain Node process.
 */
function hashPassword(password: string): string {
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const { hashPassword } = await import("better-auth/crypto"); process.stdout.write(await hashPassword(process.env.E2E_HASH_INPUT));',
    ],
    { env: { ...process.env, E2E_HASH_INPUT: password }, encoding: "utf8" }
  ).trim();
}

function isLocalHost(databaseUrl: string): boolean {
  const { hostname } = new URL(databaseUrl);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * Idempotently writes the deterministic fixtures (staff accounts and two published
 * openings with forms). Call only after assertDedicatedTestDatabase().
 */
export async function seedE2EFixtures(databaseUrl: string): Promise<void> {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocalHost(databaseUrl)
      ? undefined
      : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
    max: 2,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const passwordHash = hashPassword(E2E_STAFF_PASSWORD);
    const userIds: Record<keyof typeof E2E_USERS, string> = { admin: "", hr: "", mentor: "", trainee: "" };

    for (const key of Object.keys(E2E_USERS) as Array<keyof typeof E2E_USERS>) {
      const fixture = E2E_USERS[key];
      const user = await prisma.user.upsert({
        where: { email: fixture.email },
        create: {
          id: fixture.id,
          name: fixture.name,
          email: fixture.email,
          emailVerified: true,
          mustChangePassword: false,
          twoFactorEnabled: true,
        },
        update: { name: fixture.name, emailVerified: true, mustChangePassword: false, twoFactorEnabled: true },
        select: { id: true },
      });
      userIds[key] = user.id;

      await prisma.account.upsert({
        where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
        create: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: passwordHash,
        },
        update: { password: passwordHash },
      });

      // Like staff created in the app: the emailed sign-in code applies, with the account
      // lockout row (placeholder secret, unused).
      const hasTwoFactorRow = await prisma.twoFactor.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!hasTwoFactorRow) {
        await prisma.twoFactor.create({
          data: { userId: user.id, secret: randomBytes(32).toString("base64url"), backupCodes: "[]" },
        });
      }

      for (const role of fixture.roles) {
        await prisma.userRole.upsert({
          where: { userId_role: { userId: user.id, role: Role[role] } },
          create: { userId: user.id, role: Role[role], assignedBy: "e2e-seed" },
          update: {},
        });
      }
    }

    await prisma.subAdminPermission.upsert({
      where: { userId: userIds.hr },
      create: { userId: userIds.hr, ...E2E_HR_PERMISSIONS },
      update: { ...E2E_HR_PERMISSIONS },
    });

    const trackIds = new Map(
      (await prisma.track.findMany({ select: { id: true, slug: true } })).map((track) => [track.slug, track.id])
    );

    for (const opening of [...Object.values(E2E_OPENINGS), E2E_EXPIRED_OPENING]) {
      const type = OpeningType[opening.type];
      const listing = {
        trackId: opening.trackSlug ? (trackIds.get(opening.trackSlug) ?? null) : null,
        applyDeadline:
          opening.deadlineDaysFromNow === null ? null : new Date(Date.now() + opening.deadlineDaysFromNow * 86_400_000),
        durationText: opening.durationText,
        skills: [...opening.skills],
      };
      const schemaDefinition = getDefaultApplicationFormSchema(
        opening.type
      ) as unknown as Prisma.InputJsonValue;

      const saved = await prisma.opening.upsert({
        where: { slug: opening.slug },
        create: {
          id: opening.id,
          slug: opening.slug,
          title: opening.title,
          department: opening.department,
          location: "Remote (E2E)",
          workplaceType: WorkplaceType.REMOTE,
          type,
          description: `${opening.title}: end-to-end test fixture.`,
          requirements: "End-to-end test fixture requirements.",
          status: OpeningStatus.PUBLISHED,
          createdById: userIds.admin,
          ...listing,
        },
        update: { title: opening.title, type, status: OpeningStatus.PUBLISHED, ...listing },
        select: { id: true },
      });

      const formVersion = await prisma.openingFormVersion.upsert({
        where: { openingId_versionNumber: { openingId: saved.id, versionNumber: 1 } },
        create: {
          id: opening.formVersionId,
          openingId: saved.id,
          versionNumber: 1,
          schemaDefinition,
          isPublished: true,
          createdById: userIds.admin,
        },
        update: { schemaDefinition, isPublished: true },
        select: { id: true },
      });

      await prisma.opening.update({
        where: { id: saved.id },
        data: { activeFormVersionId: formVersion.id },
      });
    }

    const training = {
      slug: E2E_TRAINING.slug,
      title: E2E_TRAINING.title,
      trackId: trackIds.get(E2E_TRAINING.trackSlug) ?? null,
      summary: E2E_TRAINING.summary,
      description: `${E2E_TRAINING.title}: end-to-end test fixture with live classes, assignments and a final project.`,
      syllabus: E2E_TRAINING.syllabus as unknown as Prisma.InputJsonValue,
      durationWeeks: E2E_TRAINING.durationWeeks,
      feePaise: E2E_TRAINING.feePaise,
      prerequisites: "Basic programming (E2E fixture).",
      outcomes: "Ship a deployed web app (E2E fixture).",
      status: "PUBLISHED" as const,
    };
    await prisma.trainingProgram.upsert({
      where: { id: E2E_TRAINING.programId },
      create: { id: E2E_TRAINING.programId, ...training },
      update: training,
    });
    const batchDates = {
      name: E2E_TRAINING.batchName,
      startDate: new Date(Date.now() + E2E_TRAINING.batchStartsInDays * 86_400_000),
      seats: E2E_TRAINING.seats,
      status: "UPCOMING" as const,
      enrollmentDeadline: null,
    };
    await prisma.trainingBatch.upsert({
      where: { id: E2E_TRAINING.batchId },
      create: { id: E2E_TRAINING.batchId, programId: E2E_TRAINING.programId, ...batchDates },
      update: batchDates,
    });

    // Learning area (Phase 3B): the mentor runs the batch; the trainee has a paid enrollment,
    // one class that has started and one open assignment. Their learning record is reset.
    await prisma.trainingBatchMentor.upsert({
      where: { batchId_userId: { batchId: E2E_TRAINING.batchId, userId: userIds.mentor } },
      create: { batchId: E2E_TRAINING.batchId, userId: userIds.mentor, assignedById: userIds.admin },
      update: {},
    });
    const enrollment = {
      status: "ACTIVE" as const,
      listPricePaise: E2E_TRAINING.feePaise,
      amountPaidPaise: E2E_TRAINING.feePaise,
      paidAt: new Date(),
      receiptNo: "E2E-RCPT-000001",
      resultAt: null,
      resultById: null,
      resultNote: null,
    };
    await prisma.trainingEnrollment.upsert({
      where: { id: E2E_TRAINING.enrollmentId },
      create: { id: E2E_TRAINING.enrollmentId, userId: userIds.trainee, batchId: E2E_TRAINING.batchId, ...enrollment },
      update: enrollment,
    });
    await prisma.trainingSubmission.deleteMany({ where: { enrollmentId: E2E_TRAINING.enrollmentId } });
    await prisma.trainingAttendance.deleteMany({ where: { enrollmentId: E2E_TRAINING.enrollmentId } });
    await prisma.trainingFinalProject.deleteMany({ where: { enrollmentId: E2E_TRAINING.enrollmentId } });
    await prisma.trainingDemoSlot.deleteMany({ where: { batchId: E2E_TRAINING.batchId } });
    const session = {
      title: E2E_TRAINING.sessionTitle,
      startsAt: new Date(Date.now() - 2 * 3_600_000),
      durationMinutes: 60,
      meetingUrl: "https://meet.example.test/e2e",
      status: "SCHEDULED" as const,
      attendanceTakenAt: null,
      attendanceTakenById: null,
    };
    await prisma.trainingSession.upsert({
      where: { id: E2E_TRAINING.sessionId },
      create: { id: E2E_TRAINING.sessionId, batchId: E2E_TRAINING.batchId, ...session },
      update: session,
    });
    const assignment = {
      title: E2E_TRAINING.assignmentTitle,
      description: "Build a responsive landing page (end-to-end test fixture).",
      dueAt: new Date(Date.now() + 7 * 86_400_000),
      maxMarks: E2E_TRAINING.assignmentMaxMarks,
    };
    await prisma.trainingAssignment.upsert({
      where: { id: E2E_TRAINING.assignmentId },
      create: { id: E2E_TRAINING.assignmentId, batchId: E2E_TRAINING.batchId, ...assignment },
      update: assignment,
    });
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => {});
  }
}
