import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth/guards";
import { getUserPermissions } from "@/lib/auth/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { getStaffModuleAccess } from "@/features/staff-dashboard/workspace";
import { registrationAnalyticsService } from "../services/registration-analytics-service";
import type { RegistrantDetail } from "../types";
import { RegistrantDetailView } from "./registrant-detail";
import { RegistrationsDirectory } from "./registrations-directory";

/*
 * Route bodies of /admin/registrations and /subadmin/registrations (list and detail). The
 * pages authorize themselves (layouts are not a security boundary): ADMIN, or HR holding
 * `canReports` — the same rule as the registrant list in the service, which checks again.
 */

type SearchParamValue = string | string[] | undefined;
export type RegistrationsConsole = "/admin" | "/subadmin";

export const REGISTRATIONS_REFUSED_MESSAGE =
  "The Registrations page is available to administrators and to HR staff with the reports permission.";

/** The signed-in viewer when they may open the Registrations pages, otherwise null. */
export async function authorizeRegistrationsViewer(basePath: RegistrationsConsole): Promise<AuthenticatedUser | null> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?callbackUrl=${basePath}/registrations`);
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  return (await registrationAnalyticsService.canViewRegistrants(user)) ? user : null;
}

export async function renderRegistrationsPage(
  basePath: RegistrationsConsole,
  searchParams: Promise<Record<string, SearchParamValue>>
) {
  const user = await authorizeRegistrationsViewer(basePath);
  if (!user) {
    return <UnauthorizedState message={REGISTRATIONS_REFUSED_MESSAGE} />;
  }
  return <RegistrationsDirectory user={user} basePath={basePath} searchParams={await searchParams} />;
}

/** Staff application pages the viewer can open from the detail page, or null. */
async function applicationsPathFor(user: AuthenticatedUser, basePath: RegistrationsConsole): Promise<string | null> {
  if (basePath === "/admin") {
    return user.roles.includes(Role.ADMIN) ? "/admin/applications" : null;
  }
  const access = getStaffModuleAccess(user.roles, await getUserPermissions(user.id, user.roles));
  return access.applications ? "/subadmin/applications" : null;
}

export async function renderRegistrantDetailPage(
  basePath: RegistrationsConsole,
  params: Promise<{ userId: string }>
) {
  const user = await authorizeRegistrationsViewer(basePath);
  if (!user) {
    return <UnauthorizedState message={REGISTRATIONS_REFUSED_MESSAGE} />;
  }
  const { userId } = await params;

  let detail: RegistrantDetail;
  let applicationsPath: string | null;
  try {
    [detail, applicationsPath] = await Promise.all([
      registrationAnalyticsService.getRegistrantDetail(user, userId),
      applicationsPathFor(user, basePath),
    ]);
  } catch (error) {
    // Unknown ids and staff accounts (not registrants) are both "not found".
    if (error instanceof NotFoundError) {
      notFound();
    }
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message={REGISTRATIONS_REFUSED_MESSAGE} />;
    }
    throw error;
  }

  return (
    <RegistrantDetailView detail={detail} listPath={`${basePath}/registrations`} applicationsPath={applicationsPath} />
  );
}
