import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { SUB_ADMIN_ROLES } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/errors";
import { Role, type Prisma } from "@prisma/client";
import { z } from "zod";
import type { PageInfo, SubAdminItem, SubAdminListPage, SubAdminPermissionFlags } from "../types";

/** Upper bound of one page of sub-admin accounts. */
export const SUBADMIN_MAX_PAGE_SIZE = 50;
export const SUBADMIN_DEFAULT_PAGE_SIZE = 20;

/** Invalid or unknown values fall back to the default instead of failing the page. */
export const SubAdminListQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100000).optional().catch(undefined),
});

export type SubAdminListQuery = z.infer<typeof SubAdminListQuerySchema>;

/**
 * Defaults shown for a staff account without a custom permission row. Mirrors the
 * `SubAdminPermission` column defaults; the effective permissions used for authorization
 * are resolved by `getUserPermissions`, never by this list.
 */
const DISPLAY_DEFAULT_PERMISSIONS: SubAdminPermissionFlags = {
  canApplications: true,
  canOpenings: false,
  canInterviews: true,
  canEvaluations: false,
  canEmployees: false,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: false,
};

const permissionSelect = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: true,
  canReports: true,
} satisfies Prisma.SubAdminPermissionSelect;

function pageArgs(page?: number, pageSize?: number) {
  const size = Math.min(Math.max(1, Math.trunc(pageSize ?? SUBADMIN_DEFAULT_PAGE_SIZE)), SUBADMIN_MAX_PAGE_SIZE);
  const current = Math.max(1, Math.trunc(page ?? 1));
  return { skip: (current - 1) * size, take: size, page: current, pageSize: size };
}

function toPageInfo(page: number, pageSize: number, total: number): PageInfo {
  return { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

type RoleGroup = { role: Role; _count: { _all: number } };

export class SubAdminService {
  /**
   * One page of staff accounts holding a sub-admin role (Super Admin only), with the
   * directory counts computed in PostgreSQL.
   */
  async listSubAdmins(
    user: AuthenticatedUser,
    query: SubAdminListQuery & { pageSize?: number } = {}
  ): Promise<SubAdminListPage> {
    if (!user.roles.includes(Role.ADMIN)) {
      throw new ForbiddenError("Only Super Administrators can manage sub-admin accounts.");
    }

    const search = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      roles: { some: { role: { in: SUB_ADMIN_ROLES } } },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { skip, take, page, pageSize } = pageArgs(query.page, query.pageSize);

    const [rows, total, allStaffTotal, roleGroups, multiModule] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          roles: { where: { role: { in: SUB_ADMIN_ROLES } }, select: { role: true } },
          subAdminPermission: { select: permissionSelect },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { roles: { some: { role: { in: SUB_ADMIN_ROLES } } } } }),
      prisma.userRole.groupBy({
        by: ["role"],
        where: { role: { in: SUB_ADMIN_ROLES } },
        _count: { _all: true },
      }),
      // Permission rows granting four or more modules, for accounts that still hold a staff role.
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "sub_admin_permissions" p
        WHERE EXISTS (
          SELECT 1 FROM "user_roles" r
          WHERE r."userId" = p."userId"
            AND r."role"::text IN ('HR', 'MANAGER', 'INTERVIEWER', 'MENTOR')
        )
        AND ("canApplications"::int + "canOpenings"::int + "canInterviews"::int + "canEvaluations"::int
           + "canEmployees"::int + "canAttendance"::int + "canLeave"::int + "canPayroll"::int + "canReports"::int) >= 4`,
    ]);

    const groups = roleGroups as RoleGroup[];
    const roleCount = (role: Role) => groups.find((g) => g.role === role)?._count._all ?? 0;

    const items: SubAdminItem[] = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.roles[0]?.role ?? Role.HR,
      createdAt: u.createdAt.toISOString(),
      permissions: u.subAdminPermission ?? DISPLAY_DEFAULT_PERMISSIONS,
    }));

    return {
      items,
      page: toPageInfo(page, pageSize, total),
      stats: {
        total: allStaffTotal,
        hrCount: roleCount(Role.HR),
        reviewerCount: roleCount(Role.MANAGER) + roleCount(Role.MENTOR) + roleCount(Role.INTERVIEWER),
        multiModuleCount: Number(multiModule[0]?.count ?? 0),
      },
      search: search || undefined,
    };
  }
}

export const subAdminService = new SubAdminService();
