"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  FileText,
  Calendar,
  Award,
  Clock,
  ShieldCheck,
  Activity,
  CheckCheck,
  X,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  getDashboardNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
  dismissNotificationAction,
  SystemNotification,
} from "@/features/notifications/actions";

function formatRelativeTime(dateString: string): string {
  try {
    const now = Date.now();
    const time = new Date(dateString).getTime();
    const diffSec = Math.floor((now - time) / 1000);

    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Recently";
  }
}

const TYPE_CONFIG = {
  application: {
    icon: FileText,
    iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400 border-blue-200/60 dark:border-blue-900",
    badgeLabel: "Application",
    badgeColor: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200",
  },
  interview: {
    icon: Calendar,
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400 border-amber-200/60 dark:border-amber-900",
    badgeLabel: "Interview",
    badgeColor: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200",
  },
  evaluation: {
    icon: Award,
    iconBg: "bg-purple-50 text-purple-600 dark:bg-purple-950/70 dark:text-purple-400 border-purple-200/60 dark:border-purple-900",
    badgeLabel: "Evaluation",
    badgeColor: "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200",
  },
  leave: {
    icon: Clock,
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900",
    badgeLabel: "Leave / HRMS",
    badgeColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200",
  },
  security: {
    icon: ShieldCheck,
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400 border-rose-200/60 dark:border-rose-900",
    badgeLabel: "Security",
    badgeColor: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200",
  },
  system: {
    icon: Activity,
    iconBg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    badgeLabel: "System",
    badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200",
  },
};

interface DashboardNotificationsProps {
  userId?: string;
}

export function DashboardNotifications({ userId }: DashboardNotificationsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // 1. Client mount effect: load persisted read & dismissed IDs from localStorage immediately
  useEffect(() => {
    setMounted(true);
    try {
      const userRead = userId ? localStorage.getItem(`gara_notifications_read_${userId}`) : null;
      const globalRead = localStorage.getItem("gara_notifications_read");
      const readRaw = userRead || globalRead;
      if (readRaw) {
        setReadIds(new Set(JSON.parse(readRaw)));
      }

      const userDismissed = userId ? localStorage.getItem(`gara_notifications_dismissed_${userId}`) : null;
      const globalDismissed = localStorage.getItem("gara_notifications_dismissed");
      const dismissedRaw = userDismissed || globalDismissed;
      if (dismissedRaw) {
        setDismissedIds(new Set(JSON.parse(dismissedRaw)));
      }
    } catch {
      // Ignore parsing errors
    }
  }, [userId]);

  // 2. Fetch notifications on mount and when popover opens
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const data = await getDashboardNotificationsAction();
        if (isMounted) {
          setNotifications(data);

          // Merge server-persisted read statuses into client state & localStorage
          const serverRead = data.filter((n) => n.read).map((n) => n.id);
          if (serverRead.length > 0) {
            setReadIds((prev) => {
              const merged = new Set([...Array.from(prev), ...serverRead]);
              try {
                const payload = JSON.stringify(Array.from(merged));
                if (userId) {
                  localStorage.setItem(`gara_notifications_read_${userId}`, payload);
                }
                localStorage.setItem("gara_notifications_read", payload);
              } catch {
                // Ignore storage errors
              }
              return merged;
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [open, userId]);

  // 3. Handle outside click & Escape key to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Active visible notifications (not dismissed)
  const visibleNotifications = notifications.filter(
    (n) => !dismissedIds.has(n.id)
  );

  // Compute unread count (if item is marked read either in state or from server)
  const isItemUnread = (n: SystemNotification) => {
    return !n.read && !readIds.has(n.id);
  };

  const unreadCount = mounted
    ? visibleNotifications.filter(isItemUnread).length
    : visibleNotifications.filter((n) => !n.read).length;

  const displayedNotifications = visibleNotifications.filter((n) => {
    if (activeTab === "unread") {
      return isItemUnread(n);
    }
    return true;
  });

  // Mark single notification as read (client + localStorage + server cookie)
  const markAsRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);

    try {
      const payload = JSON.stringify(Array.from(next));
      if (userId) {
        localStorage.setItem(`gara_notifications_read_${userId}`, payload);
      }
      localStorage.setItem("gara_notifications_read", payload);
    } catch {
      // Ignore
    }

    startTransition(async () => {
      await markNotificationAsReadAction(id);
    });
  };

  // Mark all visible notifications as read (client + localStorage + server cookie)
  const markAllAsRead = () => {
    const next = new Set(readIds);
    visibleNotifications.forEach((n) => next.add(n.id));
    setReadIds(next);

    const idsArray = Array.from(next);
    try {
      const payload = JSON.stringify(idsArray);
      if (userId) {
        localStorage.setItem(`gara_notifications_read_${userId}`, payload);
      }
      localStorage.setItem("gara_notifications_read", payload);
    } catch {
      // Ignore
    }

    startTransition(async () => {
      await markAllNotificationsAsReadAction(visibleNotifications.map((n) => n.id));
    });
  };

  // Dismiss a notification so it never shows up again
  const dismissNotification = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);

    try {
      const payload = JSON.stringify(Array.from(next));
      if (userId) {
        localStorage.setItem(`gara_notifications_dismissed_${userId}`, payload);
      }
      localStorage.setItem("gara_notifications_dismissed", payload);
    } catch {
      // Ignore
    }

    startTransition(async () => {
      await dismissNotificationAction(id);
    });
  };

  // Handle click on a notification item
  const handleItemClick = (n: SystemNotification) => {
    markAsRead(n.id);
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        title="View Notifications"
        aria-label="View Notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`relative h-8 w-8 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
          open
            ? "border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
            : "border-border/70 bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold flex items-center justify-center ring-2 ring-card shadow-xs animate-in fade-in-50 zoom-in-75 duration-200">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-border/80 bg-card text-foreground shadow-2xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Notifications</h3>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                  {unreadCount} new
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                  Up to date
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="px-3 pt-2.5 pb-2 border-b border-border/50 flex items-center gap-1.5 bg-background">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "all"
                  ? "bg-foreground text-background font-bold shadow-2xs"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              All ({visibleNotifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("unread")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "unread"
                  ? "bg-foreground text-background font-bold shadow-2xs"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications Scrollable List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400 mb-2" />
                <p className="text-xs font-semibold text-foreground">Syncing platform alerts...</p>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="h-10 w-10 rounded-full bg-muted/60 text-muted-foreground/70 flex items-center justify-center mx-auto mb-2">
                  <CheckCheck className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  {activeTab === "unread" ? "No unread notifications" : "No notifications"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  You are completely caught up with all platform events.
                </p>
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const unread = isItemUnread(n);
                const conf = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
                const IconComponent = conf.icon;

                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 relative group ${
                      unread
                        ? "bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70 dark:hover:bg-blue-950/40"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    {/* Category Icon */}
                    <div
                      className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${conf.iconBg}`}
                    >
                      <IconComponent className="h-4 w-4" />
                    </div>

                    {/* Content Details */}
                    <div className="min-w-0 flex-1 pr-6">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`text-[9px] font-bold uppercase font-mono px-1.5 py-0.2 rounded border ${conf.badgeColor}`}
                        >
                          {conf.badgeLabel}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                      <p
                        className={`text-xs leading-snug truncate ${
                          unread ? "font-bold text-foreground" : "font-medium text-foreground/90"
                        }`}
                      >
                        {n.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {n.message}
                      </p>
                    </div>

                    {/* Right Unread Indicator & Dismiss Button */}
                    <div className="absolute right-3 top-3.5 flex items-center gap-1.5">
                      {unread && (
                        <span
                          title="Unread"
                          className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-500 shrink-0"
                        />
                      )}
                      <button
                        type="button"
                        title="Dismiss notification"
                        onClick={(e) => dismissNotification(e, n.id)}
                        className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-4 py-2.5 border-t border-border/60 bg-muted/20 flex items-center justify-between text-xs">
            <span className="text-[11px] text-muted-foreground">
              Live Real-Time Alerts
            </span>
            <Link
              href="/admin/applications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Platform Activity</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}
