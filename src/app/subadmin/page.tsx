import React from "react";
import { isInterviewerScoped } from "@/features/recruitment/services/application-access";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Briefcase,
  Calendar,
  Award,
  UserCheck,
  Clock,
  CalendarDays,
  CreditCard,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from "lucide-react";

export const instant = false;

/** A module count: a number, "unavailable" when the query failed, or null when not shown. */
type ModuleCount = number | "unavailable" | null;

async function loadModuleCount(
  allowed: boolean,
  label: string,
  query: () => Promise<number>
): Promise<ModuleCount> {
  if (!allowed) {
    return null;
  }
  try {
    return await query();
  } catch (error) {
    // Never present a failed query as a real zero count.
    logger.error(`Sub-admin dashboard count failed: ${label}`, error);
    return "unavailable";
  }
}

export default async function SubAdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin");
  }

  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));

  if (!hasStaffOrAdminRole) {
    redirect("/candidate/dashboard");
  }

  const permissions = await getUserPermissions(user.id, user.roles);

  // Parallel data fetching, only for modules this user is permitted to see
  const [
    applicationsCount,
    openingsCount,
    interviewsCount,
    employeesCount,
  ] = await Promise.all([
    // Scoped like the queue itself: interviewers count only applications assigned to them.
    loadModuleCount(permissions.canApplications, "applications", async () =>
      (await recruitmentService.getRecruitmentStatusCounts(user)).total
    ),
    loadModuleCount(permissions.canOpenings, "openings", () =>
      prisma.opening.count({ where: { status: "PUBLISHED" } })
    ),
    loadModuleCount(permissions.canInterviews, "interviews", () =>
      prisma.interviewSchedule.count({
        where: {
          status: "SCHEDULED",
          ...(isInterviewerScoped(user) ? { interviewerId: user.id } : {}),
        },
      })
    ),
    loadModuleCount(permissions.canEmployees, "employees", () => prisma.employee.count()),
  ]);

  const primaryRole =
    user.roles.find((r) => STAFF_ROLES.includes(r)) ?? "STAFF";

  const moduleCards: {
    key: string;
    allowed: boolean;
    title: string;
    description: string;
    count: ModuleCount;
    href: string;
    icon: typeof FileText;
    badge: string;
  }[] = [
    {
      key: "applications",
      allowed: permissions.canApplications,
      title: "Applications Queue",
      description: "Screen candidates, advance stages & review resumes",
      count: applicationsCount,
      href: "/subadmin/applications",
      icon: FileText,
      badge: "Recruitment",
    },
    {
      key: "openings",
      allowed: permissions.canOpenings,
      title: "Job Openings",
      description: "Manage vacancy requisitions & active listings",
      count: openingsCount,
      href: "/subadmin/openings",
      icon: Briefcase,
      badge: "Openings",
    },
    {
      key: "interviews",
      allowed: permissions.canInterviews,
      title: "Interviews",
      description: "Track schedules, panel ratings & assessments",
      count: interviewsCount,
      href: "/subadmin/interviews",
      icon: Calendar,
      badge: "Assessments",
    },
    {
      key: "evaluations",
      allowed: permissions.canEvaluations,
      title: "Intern Evaluations",
      description: "7-working-day review window & performance checkpoints",
      count: null,
      href: "/subadmin/evaluations",
      icon: Award,
      badge: "Performance",
    },
    {
      key: "employees",
      allowed: permissions.canEmployees,
      title: "Employee Directory",
      description: "Active workforce records & department staffing",
      count: employeesCount,
      href: "/subadmin/employees",
      icon: UserCheck,
      badge: "Workforce",
    },
    {
      key: "attendance",
      allowed: permissions.canAttendance,
      title: "Attendance Management",
      description: "Clock records, biometric logs & work shifts",
      count: null,
      href: "/subadmin/attendance",
      icon: Clock,
      badge: "HRMS",
    },
    {
      key: "leave",
      allowed: permissions.canLeave,
      title: "Leave Requests",
      description: "Review, approve or decline staff leave applications",
      count: null,
      href: "/subadmin/leave",
      icon: CalendarDays,
      badge: "HRMS",
    },
    {
      key: "payroll",
      allowed: permissions.canPayroll,
      title: "Payroll Management",
      description: "Salary structures, disbursements & records",
      count: null,
      href: "/subadmin/payroll",
      icon: CreditCard,
      badge: "Finance",
    },
    {
      key: "reports",
      allowed: permissions.canReports,
      title: "Analytics & Reports",
      description: "Funnel metrics, conversion trends & hiring telemetry",
      count: null,
      href: "/subadmin/reports",
      icon: BarChart3,
      badge: "Analytics",
    },
  ];

  const permittedModules = moduleCards.filter((m) => m.allowed);
  const lockedModules = moduleCards.filter((m) => !m.allowed);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono text-xs uppercase">
                {primaryRole}
              </Badge>
              <Badge variant="success" className="text-xs">
                Sub-Admin Portal Active
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome, {user.name || "Staff Member"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              You are signed into the dedicated Sub-Admin Workspace. Your navigation and actions are
              strictly limited to the modules granted by the Super Administrator.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/help">
              <Button variant="outline" size="sm">
                Help & Guidelines
              </Button>
            </Link>
          </div>
        </div>

        {/* Granted Modules Summary */}
        <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">
            Authorized Modules ({permittedModules.length}/9):
          </span>
          {permittedModules.map((m) => (
            <Badge key={m.key} variant="secondary" className="gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {m.title}
            </Badge>
          ))}
          {lockedModules.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({lockedModules.length} restricted by Super Admin)
            </span>
          )}
        </div>
      </div>

      {/* Authorized Action Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Authorized Workspaces</h2>
            <p className="text-xs text-muted-foreground">
              Direct access to operations permitted for your role
            </p>
          </div>
        </div>

        {permittedModules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center bg-card">
            <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">No Modules Assigned Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              Your Sub-Admin account does not currently have permissions enabled. Please contact your
              Super Administrator to grant access.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {permittedModules.map((module) => {
              const Icon = module.icon;
              return (
                <Card
                  key={module.key}
                  className="hover:border-primary/50 transition-all hover:shadow-md flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {module.badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-base font-semibold mt-3">
                      {module.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{module.description}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between mt-2 pt-3 border-t border-border">
                      {module.count === "unavailable" ? (
                        <div className="text-xs text-amber-700 dark:text-amber-300">
                          Count unavailable
                        </div>
                      ) : module.count !== null ? (
                        <div>
                          <div className="text-xl font-bold text-foreground">
                            {module.count}
                          </div>
                          <div className="text-[11px] text-muted-foreground uppercase">
                            Active Records
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Authorized
                        </div>
                      )}
                      <Link href={module.href}>
                        <Button size="sm" variant="outline" className="gap-1 text-xs">
                          Open <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Restricted Modules Info (Transparency) */}
      {lockedModules.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Restricted Modules
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            The following modules are configured as locked for your profile. If you require access,
            reach out to a Super Admin to toggle these privileges in the Sub-Admins panel.
          </p>
          <div className="flex flex-wrap gap-2">
            {lockedModules.map((m) => (
              <Badge
                key={m.key}
                variant="outline"
                className="text-xs text-muted-foreground border-dashed gap-1"
              >
                <Lock className="h-2.5 w-2.5 opacity-60" /> {m.title}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
