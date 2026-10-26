import React from "react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { SubAdminListQuerySchema, subAdminService } from "../services/subadmin-service";
import { SubAdminManagementClient } from "./subadmin-management-client";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Streams the sub-admin directory: validates the URL (`q`, `page`) and loads one page
 * server-side. The page itself only performs the Super Admin guard and wraps this in
 * `<Suspense>`.
 */
export async function SubAdminsPageSection({
  user,
  searchParams,
}: {
  user: AuthenticatedUser;
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const query = SubAdminListQuerySchema.parse({ q: firstValue(raw.q), page: firstValue(raw.page) });

  let list: Awaited<ReturnType<typeof subAdminService.listSubAdmins>> | null = null;
  let forbiddenMessage: string | null = null;
  try {
    list = await subAdminService.listSubAdmins(user, query);
  } catch (err) {
    if (!(err instanceof ForbiddenError)) throw err;
    forbiddenMessage = err.message;
  }

  if (!list) {
    return <UnauthorizedState message={forbiddenMessage ?? undefined} />;
  }
  return <SubAdminManagementClient items={list.items} page={list.page} stats={list.stats} search={list.search} />;
}
