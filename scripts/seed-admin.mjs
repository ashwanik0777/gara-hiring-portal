import "dotenv/config";
import crypto from "crypto";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const ADMIN_EMAIL = "garaworking007@gmail.com";
const ADMIN_NAME = "GARA Innovation Administrator";
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || "Admin@Gara2026#";

const connectionString = (process.env.DATABASE_URL || "").replace(
  "sslmode=require",
  "sslmode=verify-full"
);

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedAdmin() {
  console.log(`[SeedAdmin] Provisioning admin user for: ${ADMIN_EMAIL}...`);

  const hashedPassword = await hashPassword(ADMIN_PASSWORD);

  // 1. Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (!user) {
    const userId = crypto.randomUUID();
    user = await prisma.user.create({
      data: {
        id: userId,
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        emailVerified: true,
      },
    });
    console.log(`[SeedAdmin] Created new user: ${user.id}`);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: ADMIN_NAME,
        emailVerified: true,
      },
    });
    console.log(`[SeedAdmin] Existing user updated: ${user.id}`);
  }

  // 2. Upsert credential account with password hash
  const existingAccount = await prisma.account.findFirst({
    where: {
      userId: user.id,
      providerId: "credential",
    },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });
    console.log(`[SeedAdmin] Updated existing credential account with new password.`);
  } else {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashedPassword,
      },
    });
    console.log(`[SeedAdmin] Created new credential account with password.`);
  }

  // 3. Assign ADMIN, HR, and MANAGER roles
  const rolesToAssign = [Role.ADMIN, Role.HR, Role.MANAGER];
  for (const role of rolesToAssign) {
    await prisma.userRole.upsert({
      where: {
        userId_role: {
          userId: user.id,
          role,
        },
      },
      update: {},
      create: {
        id: crypto.randomUUID(),
        userId: user.id,
        role,
        assignedBy: "system-seed",
      },
    });
  }

  // 4. Verify assignment
  const verifiedUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { roles: true },
  });

  console.log(`[SeedAdmin] Successfully provisioned!`);
  console.log(`User ID: ${verifiedUser?.id}`);
  console.log(`Email: ${verifiedUser?.email}`);
  console.log(`Roles: ${verifiedUser?.roles.map((r) => r.role).join(", ")}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
}

seedAdmin()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[SeedAdmin] Error:", err);
    pool.end();
    process.exit(1);
  });
