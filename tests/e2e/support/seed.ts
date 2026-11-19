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
    const userIds: Record<keyof typeof E2E_USERS, string> = { admin: "", hr: "", mentor: "" };

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
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => {});
  }
}
