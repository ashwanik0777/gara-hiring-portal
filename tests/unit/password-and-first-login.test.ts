import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setNewPasswordAction,
  getPostLoginRedirectAction,
} from "@/features/auth/password-actions";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/auth";
import { UnauthorizedError } from "@/lib/errors";
import { Role } from "@prisma/client";
import * as passwordActions from "@/features/auth/password-actions";

const { mockPrisma } = vi.hoisted(() => {
  const innerMock: Record<string, unknown> = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(innerMock)),
  };
  return { mockPrisma: innerMock };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth/guards", () => ({
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      revokeOtherSessions: vi.fn().mockResolvedValue({ status: true }),
    },
  },
}));

// Lifecycle stage routing is covered in lifecycle.test.ts; here staff and candidates
// resolve through the role-based home path.
vi.mock("@/features/lifecycle/services/lifecycle-service", async () => {
  const { getHomePathForUser } = await import("@/lib/auth/home");
  return { resolveHomePath: vi.fn(async (user: Parameters<typeof getHomePathForUser>[0]) => getHomePathForUser(user)) };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("better-auth/crypto", () => ({
  hashPassword: vi.fn().mockResolvedValue("mocked_hashed_password"),
}));

const pendingUser = {
  id: "usr-1",
  email: "test@gara.com",
  name: "Test",
  roles: [],
  mustChangePassword: true,
};

describe("Password and First-Time Login Flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("setNewPasswordAction", () => {
    it("fails when user is not authenticated", async () => {
      vi.mocked(requireAuth).mockRejectedValue(
        new UnauthorizedError("You must be logged in to access this resource")
      );

      const res = await setNewPasswordAction({ newPassword: "ValidPassword123!" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("You must be logged in to access this resource");
    });

    it("only allows the temporary-password session flow (no current-password bypass)", async () => {
      vi.mocked(requireAuth).mockResolvedValue({ ...pendingUser, mustChangePassword: false });

      const res = await setNewPasswordAction({ newPassword: "SuperSecurePass@2026#" });
      expect(res.success).toBe(false);
      expect(res.error).toContain("does not have a pending temporary password");
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it("requests the auth guard with the pending-password allowance", async () => {
      vi.mocked(requireAuth).mockResolvedValue(pendingUser);

      await setNewPasswordAction({ newPassword: "Pass1!" });
      expect(requireAuth).toHaveBeenCalledWith({ allowPendingPasswordChange: true });
    });

    it("rejects passwords with less than 10 characters", async () => {
      vi.mocked(requireAuth).mockResolvedValue(pendingUser);

      const res = await setNewPasswordAction({ newPassword: "Pass1!" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Password must be at least 10 characters");
    });

    it("rejects passwords without special characters or uppercase", async () => {
      vi.mocked(requireAuth).mockResolvedValue(pendingUser);

      const res = await setNewPasswordAction({ newPassword: "simplepassword123" });
      expect(res.success).toBe(false);
      expect(res.error).toContain("uppercase letter");
    });

    it("does not leak internal error details", async () => {
      vi.mocked(requireAuth).mockResolvedValue(pendingUser);
      vi.mocked(prisma.account.findFirst).mockRejectedValue(
        new Error("connect ECONNREFUSED 10.0.0.5:5432 relation \"accounts\"")
      );
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const res = await setNewPasswordAction({ newPassword: "SuperSecurePass@2026#" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Failed to set new password.");
      consoleSpy.mockRestore();
    });

    it("successfully sets password, turns off mustChangePassword and revokes other sessions", async () => {
      vi.mocked(requireAuth).mockResolvedValue(pendingUser);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "acc-1",
        userId: "usr-1",
        providerId: "credential",
        accountId: "usr-1",
        password: "old_hashed_password",
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await setNewPasswordAction({ newPassword: "SuperSecurePass@2026#" });
      expect(res.success).toBe(true);

      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "acc-1" },
          data: expect.objectContaining({ password: "mocked_hashed_password" }),
        })
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "usr-1" },
          data: expect.objectContaining({ mustChangePassword: false }),
        })
      );
      expect(auth.api.revokeOtherSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe("getPostLoginRedirectAction", () => {
    it("routes a temporary-password session to /set-password", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(pendingUser);
      await expect(getPostLoginRedirectAction()).resolves.toEqual({
        redirectTo: "/set-password",
        mustChangePassword: true,
      });
    });

    it("sends each role straight to its portal (no /dashboard hop)", async () => {
      const base = { ...pendingUser, mustChangePassword: false };
      vi.mocked(getCurrentUser).mockResolvedValueOnce({ ...base, roles: [Role.ADMIN] });
      await expect(getPostLoginRedirectAction()).resolves.toMatchObject({ redirectTo: "/admin" });
      vi.mocked(getCurrentUser).mockResolvedValueOnce({ ...base, roles: [Role.HR] });
      await expect(getPostLoginRedirectAction()).resolves.toMatchObject({ redirectTo: "/subadmin" });
      vi.mocked(getCurrentUser).mockResolvedValueOnce({ ...base, roles: [Role.CANDIDATE] });
      await expect(getPostLoginRedirectAction()).resolves.toMatchObject({
        redirectTo: "/candidate/dashboard",
      });
    });

    it("returns no redirect for anonymous sessions", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      await expect(getPostLoginRedirectAction()).resolves.toEqual({
        redirectTo: null,
        mustChangePassword: false,
      });
    });

    it("cannot be used to look up other accounts by email", () => {
      expect(getPostLoginRedirectAction.length).toBe(0);
      expect(Object.keys(passwordActions)).not.toContain("checkUserMustChangePasswordAction");
      expect(Object.keys(passwordActions)).not.toContain("forgotPasswordAction");
    });
  });
});
