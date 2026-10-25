import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/badge";
import {
  ActionCenterPanel,
  ActionCenterSkeleton,
} from "@/features/automation/components/action-center-panel";
import { linkButtonClass } from "@/features/lifecycle/components/self-service-ui";
import {
  AwayTodaySection,
  EvaluationCohortSection,
  MyInterviewsSection,
  MyTeamSection,
  MyWorkdaySection,
  PipelineSection,
  StaffSectionSkeleton,
  SupervisedInternsSection,
  TodayInterviewsSection,
  WorkspaceModulesSection,
} from "@/features/staff-dashboard/components/staff-dashboard-sections";
import {
  getStaffModuleAccess,
  getStaffWorkspaces,
  listAccessibleStaffModules,
  STAFF_WORKSPACE_DETAILS,
  type StaffModuleKey,
  type StaffWorkspace,
} from "@/features/staff-dashboard/workspace";
import type { AuthenticatedUser } from "@/lib/auth/guards";

export const instant = false;

export const metadata = {
  title: "Overview — Staff Workspace",
  description: "Your role-specific overview of the work waiting for you.",
};

const BASE = "/subadmin";

type SectionKey =
  | "pipeline"
  | "todaysInterviews"
  | "evaluationCohort"
  | "awayToday"
  | "myTeam"
  | "myInterviews"
  | "supervisedInterns";

/** Sections of each workspace, in display order. */
const WORKSPACE_SECTIONS: Record<StaffWorkspace, SectionKey[]> = {
  HR: ["pipeline", "todaysInterviews", "evaluationCohort", "awayToday", "supervisedInterns"],
  MANAGER: ["myTeam", "myInterviews", "supervisedInterns"],
  INTERVIEWER: ["myInterviews", "supervisedInterns"],
  MENTOR: ["supervisedInterns"],
};

/** Module the viewer must be able to open for a section to be shown. */
const SECTION_MODULE: Record<SectionKey, StaffModuleKey> = {
  pipeline: "applications",
  todaysInterviews: "interviews",
  evaluationCohort: "evaluations",
  awayToday: "leave",
  myTeam: "employees",
  myInterviews: "interviews",
  supervisedInterns: "evaluations",
};

const SECTION_SKELETON_LABELS: Record<SectionKey, string> = {
  pipeline: "Loading the hiring pipeline",
  todaysInterviews: "Loading today's interviews",
  evaluationCohort: "Loading evaluations",
  awayToday: "Loading today's leave",
  myTeam: "Loading your team",
  myInterviews: "Loading your interviews",
  supervisedInterns: "Loading your interns",
};

function renderSection(key: SectionKey, user: AuthenticatedUser, workspaces: StaffWorkspace[]) {
  switch (key) {
    case "pipeline":
      return <PipelineSection user={user} base={BASE} />;
    case "todaysInterviews":
      return <TodayInterviewsSection user={user} base={BASE} />;
    case "evaluationCohort":
      return <EvaluationCohortSection user={user} base={BASE} />;
    case "awayToday":
      return <AwayTodaySection user={user} base={BASE} />;
    case "myTeam":
      return <MyTeamSection user={user} />;
    case "myInterviews":
      return <MyInterviewsSection user={user} base={BASE} />;
    case "supervisedInterns":
      // Supervising interns is the mentor's main job; for other roles it shows only when it applies.
      return <SupervisedInternsSection user={user} base={BASE} hideWhenEmpty={!workspaces.includes("MENTOR")} />;
  }
}

export default async function StaffOverviewPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  if (!user.roles.some((r) => STAFF_ROLES.includes(r))) {
    redirect("/candidate/dashboard");
  }

  const permissions = await getUserPermissions(user.id, user.roles);
  const access = getStaffModuleAccess(user.roles, permissions);
  const workspaces = getStaffWorkspaces(user.roles);
  const primary = STAFF_WORKSPACE_DETAILS[workspaces[0] ?? "HR"];

  // HR already sees every interview of the day, so "My interviews" would repeat it.
  const sections = Array.from(new Set(workspaces.flatMap((workspace) => WORKSPACE_SECTIONS[workspace]))).filter(
    (key) => access[SECTION_MODULE[key]] && !(key === "myInterviews" && workspaces.includes("HR"))
  );
  const firstName = user.name?.trim().split(/\s+/)[0] || "there";

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {workspaces.map((workspace) => (
              <Badge key={workspace} variant="outline" className="text-xs">
                {STAFF_WORKSPACE_DETAILS[workspace].title}
              </Badge>
            ))}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Welcome, {firstName}</h2>
          <p className="text-sm text-muted-foreground">{primary.summary}</p>
        </div>
        <Link href="/help" className={linkButtonClass("outline")}>
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" /> Help
        </Link>
      </header>

      {/* Work waiting for this staff member, scoped to their roles and permissions */}
      <Suspense fallback={<ActionCenterSkeleton />}>
        <ActionCenterPanel user={user} portalBase={BASE} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {sections.map((key) => (
            <Suspense key={key} fallback={<StaffSectionSkeleton label={SECTION_SKELETON_LABELS[key]} />}>
              {renderSection(key, user, workspaces)}
            </Suspense>
          ))}
        </div>
        <aside className="space-y-6" aria-label="Your workday and modules">
          <Suspense fallback={<StaffSectionSkeleton label="Loading your workday" rows={2} />}>
            <MyWorkdaySection user={user} />
          </Suspense>
          <WorkspaceModulesSection modules={listAccessibleStaffModules(access)} base={BASE} />
        </aside>
      </div>
    </div>
  );
}
