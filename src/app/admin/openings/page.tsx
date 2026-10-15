import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { getAdminOpenings } from "@/features/openings/services/opening-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Eye,
  Edit,
  ExternalLink,
} from "lucide-react";

export const instant = false;

export const metadata = {
  title: "Openings Management — Recruitment Admin",
  description: "Manage vacancy lifecycles, dynamic application forms, and publishing states.",
};

export default async function AdminOpeningsPage() {
  const user = await getCurrentUser();

  // Guard: Admin or HR only
  if (!user || (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR))) {
    redirect("/admin");
  }

  const openings = await getAdminOpenings(user);

  return (
    <div className="w-full space-y-6">

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
                          No vacancies created yet. Click &quot;Create New Opening&quot; to begin.
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
                              <Link href={`/admin/openings/${opening.id}/edit`}>
                                <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 gap-1">
                                  <Edit className="h-3 w-3" />
                                  Edit & Form
                                </Button>
                              </Link>
                              <Link href={`/admin/openings/${opening.id}/preview`}>
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
