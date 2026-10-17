"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import { Role } from "@/types/enums";
import {
  createSubAdminAction,
  updateSubAdminPermissionsAction,
  deleteSubAdminAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Check,
  X,
  Trash2,
  Lock,
  Mail,
  User,
  Settings2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Users,
  UserCheck,
  Briefcase,
  Calendar,
  Award,
  Clock,
  CalendarDays,
  CreditCard,
  BarChart3,
  FileText,
} from "lucide-react";

export interface SubAdminItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  permissions: {
    canApplications: boolean;
    canOpenings: boolean;
    canInterviews: boolean;
    canEvaluations: boolean;
    canEmployees: boolean;
    canAttendance: boolean;
    canLeave: boolean;
    canPayroll: boolean;
    canReports: boolean;
  };
}

const MODULE_CONFIGS = [
  {
    key: "canApplications" as const,
    label: "Applications",
    desc: "Candidate applications & hiring pipeline",
    icon: FileText,
  },
  {
    key: "canOpenings" as const,
    label: "Job Openings",
    desc: "Create and publish job postings",
    icon: Briefcase,
  },
  {
    key: "canInterviews" as const,
    label: "Interviews",
    desc: "Schedule rounds and interview feedback",
    icon: Calendar,
  },
  {
    key: "canEvaluations" as const,
    label: "Evaluations",
    desc: "7-day review scores & assessments",
    icon: Award,
  },
  {
    key: "canEmployees" as const,
    label: "Employees",
    desc: "Staff directory and intern records",
    icon: UserCheck,
  },
  {
    key: "canAttendance" as const,
    label: "Attendance",
    desc: "Daily shift punches & logs",
    icon: Clock,
  },
  {
    key: "canLeave" as const,
    label: "Leave Requests",
    desc: "Time-off requests & approvals",
    icon: CalendarDays,
  },
  {
    key: "canPayroll" as const,
    label: "Payroll",
    desc: "Disbursements & salary periods",
    icon: CreditCard,
  },
  {
    key: "canReports" as const,
    label: "Analytics & Reports",
    desc: "Metrics export & audit trail",
    icon: BarChart3,
  },
];

export function SubAdminManagementClient({
  initialSubAdmins,
}: {
  initialSubAdmins: SubAdminItem[];
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingSubAdmin, setEditingSubAdmin] = useState<SubAdminItem | null>(null);

  // Local overrides for optimistic updates without effect setState cascading renders
  const [localOverrides, setLocalOverrides] = useState<Record<string, SubAdminItem>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const subAdmins = useMemo(() => {
    return initialSubAdmins
      .filter((s) => !deletedIds.has(s.id))
      .map((s) => localOverrides[s.id] || s);
  }, [initialSubAdmins, localOverrides, deletedIds]);

  // Form State for creating new Sub-Admin
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<Role>(Role.HR);
  const [formPermissions, setFormPermissions] = useState({
    canApplications: true,
    canOpenings: true,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: true,
    canAttendance: true,
    canLeave: true,
    canPayroll: false,
    canReports: true,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset create form
  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole(Role.HR);
    setFormPermissions({
      canApplications: true,
      canOpenings: true,
      canInterviews: true,
      canEvaluations: true,
      canEmployees: true,
      canAttendance: true,
      canLeave: true,
      canPayroll: false,
      canReports: true,
    });
    setErrorMsg(null);
  };

  // Listen for open-subadmin-modal event from navbar button
  useEffect(() => {
    const handleOpen = () => {
      setIsCreating(true);
    };
    window.addEventListener("open-subadmin-modal", handleOpen);
    return () => window.removeEventListener("open-subadmin-modal", handleOpen);
  }, []);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingSubAdmin) setEditingSubAdmin(null);
        if (isCreating) {
          setIsCreating(false);
          resetForm();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingSubAdmin, isCreating]);

  // Lock body scroll when either modal is open
  useEffect(() => {
    if (editingSubAdmin || isCreating) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editingSubAdmin, isCreating]);

  const handleRolePreset = (r: Role) => {
    setFormRole(r);
    if (r === Role.HR) {
      setFormPermissions({
        canApplications: true,
        canOpenings: true,
        canInterviews: true,
        canEvaluations: true,
        canEmployees: true,
        canAttendance: true,
        canLeave: true,
        canPayroll: false,
        canReports: true,
      });
    } else if (r === Role.MANAGER) {
      setFormPermissions({
        canApplications: true,
        canOpenings: false,
        canInterviews: true,
        canEvaluations: true,
        canEmployees: true,
        canAttendance: true,
        canLeave: true,
        canPayroll: false,
        canReports: true,
      });
    } else if (r === Role.INTERVIEWER) {
      setFormPermissions({
        canApplications: true,
        canOpenings: false,
        canInterviews: true,
        canEvaluations: true,
        canEmployees: false,
        canAttendance: false,
        canLeave: false,
        canPayroll: false,
        canReports: false,
      });
    } else if (r === Role.MENTOR) {
      setFormPermissions({
        canApplications: true,
        canOpenings: false,
        canInterviews: true,
        canEvaluations: true,
        canEmployees: false,
        canAttendance: true,
        canLeave: false,
        canPayroll: false,
        canReports: false,
      });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await createSubAdminAction({
        name: formName,
        email: formEmail,
        password: formPassword,
        role: formRole as "HR" | "MANAGER" | "INTERVIEWER" | "MENTOR",
        permissions: formPermissions,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to create Sub-Admin");
      } else {
        setSuccessMsg(res.message || "Sub-Admin successfully created!");
        setIsCreating(false);
        resetForm();
      }
    });
  };

  const handleUpdatePermissions = (subAdmin: SubAdminItem) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await updateSubAdminPermissionsAction({
        subAdminId: subAdmin.id,
        role: subAdmin.role as "HR" | "MANAGER" | "INTERVIEWER" | "MENTOR",
        permissions: subAdmin.permissions,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to update permissions");
      } else {
        setSuccessMsg(`Permissions updated successfully for ${subAdmin.name}.`);
        setLocalOverrides((prev) => ({
          ...prev,
          [subAdmin.id]: subAdmin,
        }));
        setEditingSubAdmin(null);
      }
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove Sub-Admin ${name}?`)) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await deleteSubAdminAction(id);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to delete Sub-Admin");
      } else {
        setSuccessMsg(`Sub-Admin ${name} removed.`);
        setDeletedIds((prev) => new Set([...prev, id]));
        if (editingSubAdmin?.id === id) {
          setEditingSubAdmin(null);
        }
      }
    });
  };

  const togglePermission = (
    subAdminId: string,
    key: keyof SubAdminItem["permissions"]
  ) => {
    if (!editingSubAdmin || editingSubAdmin.id !== subAdminId) return;

    setEditingSubAdmin({
      ...editingSubAdmin,
      permissions: {
        ...editingSubAdmin.permissions,
        [key]: !editingSubAdmin.permissions[key],
      },
    });
  };

  // Computed KPI Metrics
  const totalSubAdmins = subAdmins.length;
  const hrCount = subAdmins.filter((s) => s.role === Role.HR).length;
  const managerReviewerCount = subAdmins.filter(
    (s) =>
      s.role === Role.MANAGER ||
      s.role === Role.MENTOR ||
      s.role === Role.INTERVIEWER
  ).length;
  const multiModuleCount = subAdmins.filter(
    (s) => Object.values(s.permissions).filter(Boolean).length >= 4
  ).length;

  return (
    <div className="space-y-6">
      {/* Toast Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 4 KPI Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sub-Admins */}
        <div className="bg-card border border-border/70 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Total Sub-Admins
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {totalSubAdmins}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Configured delegates
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4" />
          </div>
        </div>

        {/* Card 2: HR Specialists */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              HR Specialists
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {hrCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Hiring & onboarding
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>

        {/* Card 3: Managers & Interviewers */}
        <div className="bg-card border border-border/70 border-l-4 border-l-violet-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Managers & Reviewers
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {managerReviewerCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Evaluations & reviews
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Settings2 className="h-4 w-4" />
          </div>
        </div>

        {/* Card 4: Multi-Module Access */}
        <div className="bg-card border border-border/70 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Multi-Module Scope
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {multiModuleCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              4+ module permissions
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Lock className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Provision New Sub-Admin Centered Modal Overlay */}
      {isCreating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCreating(false);
              resetForm();
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-2xl bg-card border border-border/80 shadow-2xl rounded-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Provision New Sub-Admin Account
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Assign role and granular permissions for delegate access
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  resetForm();
                }}
                className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors cursor-pointer"
                title="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Priya Sharma"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="e.g. priya.hr@gara.io"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Temporary Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Role Preset Selector */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  Staff Role & Baseline Preset
                </label>
                <div className="flex flex-wrap gap-2">
                  {[Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRolePreset(r)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        formRole === r
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Granular Module Permission Toggles */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  Granular Module Permissions
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {MODULE_CONFIGS.map(({ key, label, desc, icon: ModIcon }) => {
                    const isChecked = formPermissions[key as keyof typeof formPermissions];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setFormPermissions({
                            ...formPermissions,
                            [key]: !isChecked,
                          })
                        }
                        className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                          isChecked
                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-200 shadow-2xs"
                            : "bg-muted/20 border-border/70 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <div className="flex items-center gap-1.5">
                            <ModIcon
                              className={`h-3.5 w-3.5 ${
                                isChecked
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground"
                              }`}
                            />
                            <span className="font-bold text-xs text-foreground">{label}</span>
                          </div>
                          <div
                            className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${
                              isChecked
                                ? "bg-emerald-500 text-white"
                                : "bg-muted border border-border text-muted-foreground"
                            }`}
                          >
                            {isChecked ? (
                              <Check className="h-2.5 w-2.5 stroke-[3]" />
                            ) : (
                              <X className="h-2.5 w-2.5 stroke-[2]" />
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground line-clamp-1">
                          {desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreating(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isPending} className="text-xs">
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Provisioning...
                    </>
                  ) : (
                    "Create Sub-Admin Account"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Permissions Centered Modal Overlay */}
      {editingSubAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingSubAdmin(null);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-xl bg-card border border-border/80 shadow-2xl rounded-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Configure Sub-Admin Permissions
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Customize role and granular module authorizations
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSubAdmin(null)}
                className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sub-Admin Profile Details */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                  {editingSubAdmin.name
                    .split(" ")
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-xs text-foreground">
                    {editingSubAdmin.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {editingSubAdmin.email}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-mono font-bold">
                {editingSubAdmin.role}
              </Badge>
            </div>

            {/* Role & Baseline Presets */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                Staff Role & Baseline Preset
              </label>
              <div className="flex flex-wrap gap-2">
                {[Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      if (r === Role.HR) {
                        setEditingSubAdmin({
                          ...editingSubAdmin,
                          role: r,
                          permissions: {
                            canApplications: true,
                            canOpenings: true,
                            canInterviews: true,
                            canEvaluations: true,
                            canEmployees: true,
                            canAttendance: true,
                            canLeave: true,
                            canPayroll: false,
                            canReports: true,
                          },
                        });
                      } else if (r === Role.MANAGER) {
                        setEditingSubAdmin({
                          ...editingSubAdmin,
                          role: r,
                          permissions: {
                            canApplications: true,
                            canOpenings: false,
                            canInterviews: true,
                            canEvaluations: true,
                            canEmployees: true,
                            canAttendance: true,
                            canLeave: true,
                            canPayroll: false,
                            canReports: true,
                          },
                        });
                      } else if (r === Role.INTERVIEWER) {
                        setEditingSubAdmin({
                          ...editingSubAdmin,
                          role: r,
                          permissions: {
                            canApplications: true,
                            canOpenings: false,
                            canInterviews: true,
                            canEvaluations: true,
                            canEmployees: false,
                            canAttendance: false,
                            canLeave: false,
                            canPayroll: false,
                            canReports: false,
                          },
                        });
                      } else if (r === Role.MENTOR) {
                        setEditingSubAdmin({
                          ...editingSubAdmin,
                          role: r,
                          permissions: {
                            canApplications: true,
                            canOpenings: false,
                            canInterviews: true,
                            canEvaluations: true,
                            canEmployees: false,
                            canAttendance: true,
                            canLeave: false,
                            canPayroll: false,
                            canReports: false,
                          },
                        });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      editingSubAdmin.role === r
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Granular Module Permission Toggles */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground block">
                  Active Module Permissions
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubAdmin({
                        ...editingSubAdmin,
                        permissions: {
                          canApplications: true,
                          canOpenings: true,
                          canInterviews: true,
                          canEvaluations: true,
                          canEmployees: true,
                          canAttendance: true,
                          canLeave: true,
                          canPayroll: true,
                          canReports: true,
                        },
                      });
                    }}
                    className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubAdmin({
                        ...editingSubAdmin,
                        permissions: {
                          canApplications: false,
                          canOpenings: false,
                          canInterviews: false,
                          canEvaluations: false,
                          canEmployees: false,
                          canAttendance: false,
                          canLeave: false,
                          canPayroll: false,
                          canReports: false,
                        },
                      });
                    }}
                    className="text-[10px] text-muted-foreground hover:underline font-medium cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MODULE_CONFIGS.map(({ key, label, desc, icon: ModIcon }) => {
                  const checked =
                    editingSubAdmin.permissions[
                      key as keyof typeof editingSubAdmin.permissions
                    ];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        togglePermission(
                          editingSubAdmin.id,
                          key as keyof typeof editingSubAdmin.permissions
                        )
                      }
                      className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        checked
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-200 shadow-2xs"
                          : "bg-muted/20 border-border/70 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div className="flex items-center gap-1.5">
                          <ModIcon
                            className={`h-3.5 w-3.5 ${
                              checked
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            }`}
                          />
                          <span className="font-bold text-xs text-foreground">{label}</span>
                        </div>
                        <div
                          className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${
                            checked
                              ? "bg-emerald-500 text-white"
                              : "bg-muted border border-border text-muted-foreground"
                          }`}
                        >
                          {checked ? (
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          ) : (
                            <X className="h-2.5 w-2.5 stroke-[2]" />
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground line-clamp-1">
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingSubAdmin(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleUpdatePermissions(editingSubAdmin)}
                disabled={isPending}
                className="text-xs"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Save Permissions
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Admins Directory Table */}
      <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground font-semibold">
              <tr>
                <th className="py-3 px-4">Sub-Admin Member</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Active Module Access</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {subAdmins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No Sub-Admins provisioned yet. Click &quot;+ Create Sub-Admin&quot; in the top navbar to add HR,
                    Managers, or Interviewers.
                  </td>
                </tr>
              ) : (
                subAdmins.map((subAdmin) => {
                  const perms = subAdmin.permissions;
                  const initials = subAdmin.name
                    .split(" ")
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();

                  return (
                    <tr key={subAdmin.id} className="hover:bg-muted/20 transition-colors">
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{subAdmin.name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {subAdmin.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono font-bold">
                          {subAdmin.role}
                        </Badge>
                      </td>

                      {/* Active Module Access */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {perms.canApplications && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-medium">
                              Apps
                            </span>
                          )}
                          {perms.canOpenings && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium">
                              Openings
                            </span>
                          )}
                          {perms.canInterviews && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-medium">
                              Interviews
                            </span>
                          )}
                          {perms.canEvaluations && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-medium">
                              Evaluations
                            </span>
                          )}
                          {perms.canEmployees && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-medium">
                              Employees
                            </span>
                          )}
                          {perms.canAttendance && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 font-medium">
                              Attendance
                            </span>
                          )}
                          {perms.canLeave && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-medium">
                              Leave
                            </span>
                          )}
                          {perms.canPayroll && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 font-medium">
                              Payroll
                            </span>
                          )}
                          {perms.canReports && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 font-medium">
                              Reports
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingSubAdmin(subAdmin)}
                            className="text-[11px] h-7 px-2.5"
                          >
                            <Settings2 className="h-3 w-3 mr-1" /> Permissions
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(subAdmin.id, subAdmin.name)}
                            disabled={isPending}
                            className="text-[11px] h-7 px-2"
                            title="Delete Sub-Admin"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
