"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  Award,
  UserCheck,
  Clock,
  CalendarDays,
  CreditCard,
  BarChart3,
  MessageSquare,
  Settings,
  ExternalLink,
  FileText,
  Layers,
  ShieldCheck,
  HelpCircle,
  User,
  CheckCircle2,
  Package,
  Eye,
  LogOut,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  X,
  Plus,
  ArrowLeft,
  SlidersHorizontal,
  LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { DashboardNotifications } from "./dashboard-notifications";

export interface DashboardNavItem {
  label: string;
  href: string;
  iconName: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline" | "success" | "warning";
}

export interface DashboardUser {
  id?: string;
  name: string;
  email: string;
  role?: string;
  image?: string | null;
}

export interface DashboardShellAction {
  label: string;
  href?: string;
  onClickEvent?: string;
  iconName?: string;
}

export interface DashboardShellProps {
  portalName: string;
  portalBadge?: string;
  user: DashboardUser;
  navItems: DashboardNavItem[];
  title?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  Award,
  UserCheck,
  Clock,
  CalendarDays,
  CreditCard,
  BarChart3,
  MessageSquare,
  Settings,
  ExternalLink,
  FileText,
  Layers,
  ShieldCheck,
  HelpCircle,
  User,
  CheckCircle2,
  Package,
  Eye,
  Plus,
  ArrowLeft,
};

interface TabMeta {
  label: string;
  iconName: string;
  action?: DashboardShellAction;
}

const ROUTE_CONFIG: Record<string, TabMeta> = {
  "/admin": { label: "Overview", iconName: "LayoutDashboard" },
  "/admin/subadmins": {
    label: "Sub-Admins",
    iconName: "ShieldCheck",
    action: {
      label: "Create Sub-Admin",
      onClickEvent: "open-subadmin-modal",
      iconName: "Plus",
    },
  },
  "/admin/applications": { label: "Applications", iconName: "FileText" },
  "/admin/openings": {
    label: "Job Openings",
    iconName: "Briefcase",
    action: {
      label: "Create Opening",
      href: "/admin/openings/new",
      iconName: "Plus",
    },
  },
  "/admin/openings/new": {
    label: "Create Opening",
    iconName: "Briefcase",
    action: {
      label: "Back to Openings",
      href: "/admin/openings",
      iconName: "ArrowLeft",
    },
  },
  "/admin/interviews": { label: "Interviews", iconName: "Calendar" },
  "/admin/evaluations": { label: "Evaluations", iconName: "Award" },
  "/admin/employees": { label: "Employees", iconName: "UserCheck" },
  "/admin/attendance": {
    label: "Attendance",
    iconName: "Clock",
    action: {
      label: "Record Attendance",
      onClickEvent: "record-attendance",
      iconName: "Clock",
    },
  },
  "/hrms/attendance": {
    label: "Attendance",
    iconName: "Clock",
    action: {
      label: "Record Attendance",
      onClickEvent: "record-attendance",
      iconName: "Clock",
    },
  },
  "/admin/leave": {
    label: "Leave & Time-Off Management",
    iconName: "CalendarDays",
  },
  "/hrms/leave": {
    label: "Leave & Time-Off Management",
    iconName: "CalendarDays",
  },
  "/admin/payroll": { label: "Payroll & Compensation", iconName: "CreditCard" },
  "/hrms/payroll": { label: "Payroll & Compensation", iconName: "CreditCard" },
  "/admin/reports": { label: "Analytics & Reports", iconName: "BarChart3" },
  "/candidate/dashboard": {
    label: "Dashboard",
    iconName: "LayoutDashboard",
    action: {
      label: "Explore Openings",
      href: "/careers",
      iconName: "Briefcase",
    },
  },
  "/candidate/applications": {
    label: "My Applications",
    iconName: "FileText",
    action: {
      label: "Explore Openings",
      href: "/careers",
      iconName: "Plus",
    },
  },
  "/candidate/profile": {
    label: "Candidate Profile",
    iconName: "User",
    action: {
      label: "My Applications",
      href: "/candidate/applications",
      iconName: "FileText",
    },
  },
  "/intern/dashboard": {
    label: "Workspace",
    iconName: "LayoutDashboard",
    action: {
      label: "View Attendance",
      href: "/hrms/attendance",
      iconName: "Clock",
    },
  },
  "/subadmin": { label: "Overview", iconName: "LayoutDashboard" },
  "/subadmin/openings": {
    label: "Job Openings",
    iconName: "Briefcase",
    action: {
      label: "Create Opening",
      href: "/subadmin/openings/new",
      iconName: "Plus",
    },
  },
  "/subadmin/openings/new": {
    label: "Create Vacancy",
    iconName: "Briefcase",
    action: {
      label: "Back to Openings",
      href: "/subadmin/openings",
      iconName: "ArrowLeft",
    },
  },
  "/subadmin/applications": { label: "Applications", iconName: "FileText" },
  "/subadmin/interviews": { label: "Interviews", iconName: "Calendar" },
  "/subadmin/evaluations": { label: "Evaluations", iconName: "Award" },
  "/subadmin/employees": { label: "Employees", iconName: "UserCheck" },
  "/subadmin/attendance": {
    label: "Attendance",
    iconName: "Clock",
    action: {
      label: "Record Attendance",
      onClickEvent: "record-attendance",
      iconName: "Clock",
    },
  },
  "/subadmin/leave": {
    label: "Leave & Time-Off Management",
    iconName: "CalendarDays",
  },
  "/subadmin/payroll": { label: "Payroll & Compensation", iconName: "CreditCard" },
  "/subadmin/reports": { label: "Analytics & Reports", iconName: "BarChart3" },
  "/admin/chatbot": {
    label: "Chatbot Support",
    iconName: "MessageSquare",
  },
  "/subadmin/chatbot": {
    label: "Chatbot Support",
    iconName: "MessageSquare",
  },
  "/help": { label: "Support & FAQs", iconName: "HelpCircle" },
};

function getInitials(name: string): string {
  if (!name) return "GA";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function DashboardShell({
  portalName,
  portalBadge,
  user,
  navItems,
  title,
  headerAction,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      router.replace("/login");
    } finally {
      setIsSigningOut(false);
    }
  };

  // Keyboard shortcut for Cmd/Ctrl+K search focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.getElementById("dashboard-global-search");
        searchInput?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const initials = getInitials(user.name);
  const userRole = user.role || "Member";

  // Route metadata lookup
  const routeMeta =
    ROUTE_CONFIG[pathname] ||
    Object.entries(ROUTE_CONFIG).find(([path]) =>
      path !== "/admin" &&
      path !== "/subadmin" &&
      path !== "/candidate/dashboard" &&
      path !== "/intern/dashboard" &&
      pathname.startsWith(path)
    )?.[1];

  // Compute active item from navItems
  const activeNavItem = navItems.find((item) => {
    if (item.href === "/admin") return pathname === "/admin";
    if (item.href === "/subadmin") return pathname === "/subadmin";
    if (item.href === "/candidate/dashboard") return pathname === "/candidate/dashboard";
    if (item.href === "/intern/dashboard") return pathname === "/intern/dashboard";
    return pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
  });

  const displayTitle = title || routeMeta?.label || activeNavItem?.label || "Overview";
  const iconKey = routeMeta?.iconName || activeNavItem?.iconName || "LayoutDashboard";
  const HeaderIcon = ICON_MAP[iconKey] || LayoutDashboard;

  const currentAction = routeMeta?.action;
  const ActionIcon = currentAction?.iconName ? ICON_MAP[currentAction.iconName] || Plus : Plus;

  return (
    <div className="min-h-screen bg-[#f3f4f7] dark:bg-[#0a0d14] text-foreground p-2 sm:p-3 md:p-4 flex gap-3 md:gap-4 overflow-hidden h-screen max-h-screen">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Left Sidebar Panel */}
      <aside
        className={`fixed md:static inset-y-2 left-2 z-50 md:z-auto transition-all duration-300 ease-in-out flex flex-col justify-between bg-card border border-border/70 rounded-2xl md:rounded-3xl shadow-sm ${
          collapsed ? "w-20" : "w-64"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Brand & Header Section */}
        <div className="p-3.5 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={navItems[0]?.href || "/"}
              className="flex items-center gap-2.5 min-w-0"
              title="GARA Innovation"
            >
              <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 border border-border/60 bg-muted/30">
                <Image
                  src="/brand/gara-emblem.png"
                  alt="GARA Innovation Emblem"
                  width={32}
                  height={32}
                  sizes="32px"
                  className="object-contain w-full h-full"
                  priority
                />
              </div>

              {!collapsed && (
                <div className="min-w-0 flex flex-col">
                  <span className="font-extrabold text-xs tracking-tight text-foreground uppercase truncate">
                    GARA INNOVATION
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase font-mono py-0 px-1.5 leading-tight tracking-wider bg-muted/60 text-muted-foreground border-border/60 font-semibold"
                    >
                      {portalBadge || portalName}
                    </Badge>
                  </div>
                </div>
              )}
            </Link>

            {/* Collapse toggle (Desktop) */}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden md:flex h-6 w-6 rounded-full border border-border/60 bg-background hover:bg-muted text-muted-foreground hover:text-foreground items-center justify-center text-xs transition-colors shrink-0 shadow-2xs"
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Close toggle (Mobile) */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="md:hidden h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation Items List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
          {navItems.map((item) => {
            const Icon = ICON_MAP[item.iconName] || LayoutDashboard;
            const isExact = pathname === item.href;
            const isSubPath =
              item.href !== "/admin" &&
              item.href !== "/subadmin" &&
              item.href !== "/candidate/dashboard" &&
              item.href !== "/intern/dashboard" &&
              item.href !== "/" &&
              pathname.startsWith(item.href);
            const isActive = isExact || isSubPath;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 font-semibold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-muted-foreground group-hover:text-foreground"
                  }`}
                />
                {!collapsed && (
                  <span className="truncate flex-1">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-primary/10 text-primary font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom User Profile Section */}
        <div className="p-2.5 border-t border-border/50">
          <div
            className={`rounded-xl border border-border/70 bg-muted/30 dark:bg-muted/10 p-2 flex items-center justify-between gap-2 shadow-2xs ${
              collapsed ? "flex-col justify-center p-1.5" : ""
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800"
                title={user.name}
              >
                {initials}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex flex-col">
                  <span className="text-xs font-bold text-foreground truncate max-w-[105px]">
                    {user.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize truncate">
                    {userRole}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              title="Sign out"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSigningOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Right Main Content Container */}
      <section className="flex-1 bg-card border border-border/70 rounded-2xl md:rounded-3xl shadow-sm flex flex-col min-w-0 overflow-hidden">
        {/* Top Header / Action Bar */}
        <header className="px-4 sm:px-6 py-3 border-b border-border/50 flex items-center justify-between gap-4 bg-card/60 backdrop-blur-xs">
          {/* Left Title & Icon */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Menu */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden h-8 w-8 rounded-lg border border-border/70 bg-background text-foreground flex items-center justify-center shadow-2xs"
              aria-label="Open sidebar menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200/60 dark:border-blue-900/60 shadow-2xs">
                <HeaderIcon className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
                  {pathname === "/admin" ? "Administrator Command Center" : displayTitle}
                </h1>
                {(pathname === "/admin/reports" || pathname === "/subadmin/reports") && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 px-2 py-0.5 shrink-0"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live DB
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Global Search Bar */}
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                id="dashboard-global-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search anything..."
                className="w-40 lg:w-56 pl-8 pr-8 py-1.5 text-xs rounded-xl border border-border/70 bg-muted/40 dark:bg-muted/20 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[9px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground shadow-2xs">
                ⌘K
              </kbd>
            </div>

            {/* Segmented Theme Toggle */}
            <ThemeToggle />

            {/* Fully Functional Notifications Bell Popover */}
            <DashboardNotifications userId={user.id || user.email} />

            {/* Tab Action Buttons (Rightmost, right after the notification bell) */}
            {headerAction ? (
              headerAction
            ) : pathname === "/admin" ? (
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/admin/openings/new"
                  className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Create Opening</span>
                </Link>
                <Link
                  href="/admin/subadmins"
                  className="h-8 px-3 rounded-xl border border-border/80 bg-background hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="hidden sm:inline">Manage Staff</span>
                </Link>
              </div>
            ) : pathname === "/admin/leave" || pathname === "/subadmin/leave" || pathname === "/hrms/leave" ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("open-leave-category-modal"));
                  }}
                  className="h-8 px-3 rounded-xl border border-border/80 bg-background hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="hidden sm:inline">New Category</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("open-apply-leave-tab"));
                  }}
                  className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Grant / Apply Leave</span>
                </button>
              </div>
            ) : currentAction ? (
              currentAction.href ? (
                <Link
                  href={currentAction.href}
                  className="h-8 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  <ActionIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{currentAction.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (currentAction.onClickEvent) {
                      window.dispatchEvent(new CustomEvent(currentAction.onClickEvent));
                    }
                  }}
                  className="h-8 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  <ActionIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{currentAction.label}</span>
                </button>
              )
            ) : null}
          </div>
        </header>

        {/* Scrollable Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {children}
        </main>
      </section>
    </div>
  );
}
