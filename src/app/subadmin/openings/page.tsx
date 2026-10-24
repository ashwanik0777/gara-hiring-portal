import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { getAdminOpenings } from "@/features/openings/services/opening-service";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Briefcase,
  Edit,
  Eye,
  ExternalLink,
  Plus,
  ShieldCheck,
} from "lucide-react";

export const instant = false;

export default async function SubAdminOpeningsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/openings");
  }

  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level guard: the granular `canOpenings` permission is the gate (layouts are not a
  // security boundary). Candidates and staff without it are refused.
  if (!(await hasPermission(user, "canOpenings"))) {
    return <UnauthorizedState message="You do not have permission to manage job openings." />;
  }

  let openings: Awaited<ReturnType<typeof getAdminOpenings>>;
  try {
    openings = await getAdminOpenings(user);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message="You do not have permission to manage job openings." />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <ShieldCheck className="h-3 w-3 text-primary mr-1" />
              Sub-Admin Workspace
            </Badge>
            <span className="text-xs text-muted-foreground">Authorized access</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" /> Vacancy Directory
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Browse published vacancies, application formats, and live requisition statuses.
          </p>
        </div>
        <Link href="/subadmin/openings/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create New Opening
          </Button>
        </Link>
      </div>

      {/* Table / List */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">All Program Vacancies ({openings.length})</CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-xs font-semibold text-muted-foreground">
                  <th className="py-3 px-4">Title & Slug</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Active Form</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {openings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                      No vacancies found.
                    </td>
                  </tr>
                ) : (
                  openings.map((opening) => {
                    const statusVariants: Record<string, "default" | "secondary" | "warning" | "destructive" | "outline"> = {
                      DRAFT: "secondary",
                      PUBLISHED: "default",
                      PAUSED: "warning",
                      CLOSED: "destructive",
                    };

                    const activeVersion = opening.formVersions.find((v) => v.isPublished);

                    return (
                      <tr key={opening.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-foreground text-sm">{opening.title}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">/careers/{opening.slug}</p>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-muted-foreground">{opening.department}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-[11px]">
                            {opening.type === "INTERNSHIP" ? "Internship" : "Full-Time"}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant={statusVariants[opening.status] ?? "secondary"} className="text-[11px]">
                            {opening.status}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono text-muted-foreground">
                          {activeVersion ? `v${activeVersion.versionNumber} (Live)` : "v1 (Draft)"}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <Link href={`/subadmin/openings/${opening.id}/edit`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 gap-1">
                              <Edit className="h-3 w-3" />
                              Edit & Form
                            </Button>
                          </Link>
                          <Link href={`/subadmin/openings/${opening.id}/preview`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1">
                              <Eye className="h-3 w-3" />
                              Preview
                            </Button>
                          </Link>
                          {opening.status === "PUBLISHED" && (
                            <Link href={`/careers/${opening.slug}`} target="_blank">
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
