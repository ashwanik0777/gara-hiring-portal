import { DashboardNavItem } from "@/components/dashboard/dashboard-shell";

/**
 * Administrator sidebar. Links of the same kind share a `group` and sit together under its
 * heading; links that fit no group (Overview, Analytics & Reports, Sub-Admins, Chatbot
 * Support) stand alone. Keep each group contiguous: the sidebar shows consecutive items with
 * the same group as one block.
 */
export const ADMIN_NAV_ITEMS: DashboardNavItem[] = [
  { label: "Overview", href: "/admin", iconName: "LayoutDashboard" },

  // Hiring, in pipeline order.
  { label: "Job Openings", href: "/admin/openings", iconName: "Briefcase", group: "Hiring" },
  { label: "Registrations", href: "/admin/registrations", iconName: "UserPlus", group: "Hiring" },
  { label: "Applications", href: "/admin/applications", iconName: "FileText", group: "Hiring" },
  { label: "Interviews", href: "/admin/interviews", iconName: "Calendar", group: "Hiring" },
  { label: "Evaluations", href: "/admin/evaluations", iconName: "Award", group: "Hiring" },

  // Industrial Training and the programmes around it.
  { label: "Industrial Training", href: "/admin/training", iconName: "BookOpen", group: "Training & Outreach" },
  { label: "Campus Ambassadors", href: "/admin/campus-ambassadors", iconName: "Users", group: "Training & Outreach" },
  { label: "Colleges", href: "/admin/colleges", iconName: "GraduationCap", group: "Training & Outreach" },

  // Certificates of every kind (internship, training, ambassador) and printed copies.
  { label: "Issued Certificates", href: "/admin/certificates", iconName: "Award", group: "Certificates" },
  { label: "Print Orders", href: "/admin/print-orders", iconName: "Package", group: "Certificates" },

  // People who have joined.
  { label: "Employees", href: "/admin/employees", iconName: "UserCheck", group: "People & HR" },
  { label: "Intern Reviews", href: "/admin/intern-reviews", iconName: "CheckCircle2", group: "People & HR" },
  { label: "Attendance", href: "/admin/attendance", iconName: "Clock", group: "People & HR" },
  { label: "Leave Management", href: "/admin/leave", iconName: "CalendarDays", group: "People & HR" },
  { label: "Payroll", href: "/admin/payroll", iconName: "CreditCard", group: "People & HR" },

  // Standalone.
  { label: "Analytics & Reports", href: "/admin/reports", iconName: "BarChart3" },
  { label: "Sub-Admins", href: "/admin/subadmins", iconName: "ShieldCheck" },
  { label: "Chatbot Support", href: "/admin/chatbot", iconName: "MessageSquare" },
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
    href: "/subadmin/employees",
    iconName: "UserCheck",
  },
  {
    label: "Support & Help",
    href: "/help",
    iconName: "MessageSquare",
  },
];
