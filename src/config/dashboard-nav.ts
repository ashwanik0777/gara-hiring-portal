import { DashboardNavItem } from "@/components/dashboard/dashboard-shell";

export const ADMIN_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/admin",
    iconName: "LayoutDashboard",
  },
  {
    label: "Sub-Admins",
    href: "/admin/subadmins",
    iconName: "ShieldCheck",
  },
  {
    label: "Applications",
    href: "/admin/applications",
    iconName: "FileText",
  },
  {
    label: "Job Openings",
    href: "/admin/openings",
    iconName: "Briefcase",
  },
  {
    label: "Interviews",
    href: "/admin/interviews",
    iconName: "Calendar",
  },
  {
    label: "Evaluations",
    href: "/admin/evaluations",
    iconName: "Award",
  },
  {
    label: "Employees",
    href: "/admin/employees",
    iconName: "UserCheck",
  },
  {
    label: "Attendance",
    href: "/admin/attendance",
    iconName: "Clock",
  },
  {
    label: "Leave Management",
    href: "/admin/leave",
    iconName: "CalendarDays",
  },
  {
    label: "Payroll",
    href: "/admin/payroll",
    iconName: "CreditCard",
  },
  {
    label: "Analytics & Reports",
    href: "/admin/reports",
    iconName: "BarChart3",
  },
  {
    label: "Chatbot Support",
    href: "/admin/chatbot",
    iconName: "MessageSquare",
  },
];

export const CANDIDATE_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: "Dashboard",
    href: "/candidate/dashboard",
    iconName: "LayoutDashboard",
  },
  {
    label: "My Applications",
    href: "/candidate/applications",
    iconName: "FileText",
  },
  {
    label: "Candidate Profile",
    href: "/candidate/profile",
    iconName: "User",
  },
  {
    label: "Explore Openings",
    href: "/careers",
    iconName: "Briefcase",
  },
  {
    label: "Verify Certificate",
    href: "/verify",
    iconName: "Award",
  },
  {
    label: "Support & Help",
    href: "/help",
    iconName: "MessageSquare",
  },
];

export const INTERN_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: "Workspace",
    href: "/intern/dashboard",
    iconName: "LayoutDashboard",
  },
  {
    label: "My Applications",
    href: "/candidate/dashboard",
    iconName: "FileText",
  },
  {
    label: "Attendance",
    href: "/hrms/attendance",
    iconName: "Clock",
  },
  {
    label: "Leave Requests",
    href: "/hrms/leave",
    iconName: "CalendarDays",
  },
  {
    label: "Verify Certificate",
    href: "/verify",
    iconName: "Award",
  },
  {
    label: "Support & Help",
    href: "/help",
    iconName: "MessageSquare",
  },
];

export const HRMS_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: "Attendance",
    href: "/hrms/attendance",
    iconName: "Clock",
  },
  {
    label: "Leave Management",
    href: "/hrms/leave",
    iconName: "CalendarDays",
  },
  {
    label: "Payroll",
    href: "/hrms/payroll",
    iconName: "CreditCard",
  },
  {
    label: "Employee Directory",
    href: "/admin/employees",
    iconName: "UserCheck",
  },
  {
    label: "Support & Help",
    href: "/help",
    iconName: "MessageSquare",
  },
];
