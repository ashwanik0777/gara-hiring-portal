"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Lock,
  User as UserIcon,
  LayoutDashboard,
  LogOut,
  ChevronDown,
  Briefcase,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { Role } from "@/types/enums";
import { SUB_ADMIN_ROLES } from "@/lib/auth/roles";

interface UserProfileData {
  id: string;
  name: string;
  email: string;
  roles: Role[];
}

export function NavbarAuthActions({
  initialUser,
}: {
  initialUser?: UserProfileData | null;
}) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [user, setUser] = useState<UserProfileData | null>(initialUser || null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync session and fetch full roles from /api/auth/me if logged in
  useEffect(() => {
    let isMounted = true;

    const timer = setTimeout(async () => {
      if (session?.user) {
        try {
          const res = await fetch("/api/auth/me");
          if (res.ok) {
            const data = await res.json();
            if (isMounted && data.user) {
              setUser(data.user);
              return;
            }
          }
        } catch {
          // Fallback: use basic session data if endpoint is unreachable
        }

        if (isMounted) {
          setUser({
            id: session.user.id,
            name: session.user.name || "User",
            email: session.user.email || "",
            roles: [Role.CANDIDATE],
          });
        }
      } else if (!sessionPending && !initialUser) {
        if (isMounted) {
          setUser(null);
        }
      }
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [session, sessionPending, initialUser]);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      setUser(null);
      setIsOpen(false);
      router.replace("/");
      router.refresh();
    } catch {
      router.replace("/");
    } finally {
      setIsSigningOut(false);
    }
  };

  // Determine user dashboard href and badge label based on role
  const isAdmin = user?.roles?.includes(Role.ADMIN);
  const isSubAdmin = user?.roles?.some((r) => SUB_ADMIN_ROLES.includes(r));

  const dashboardHref = isAdmin
    ? "/admin"
    : isSubAdmin
      ? "/subadmin"
      : "/candidate/dashboard";

  const roleBadgeLabel = isAdmin
    ? "Admin"
    : isSubAdmin
      ? user?.roles?.[0] || "Sub-Admin"
      : "Candidate";

  const roleBadgeColor = isAdmin
    ? "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800"
    : isSubAdmin
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800"
      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";

  // Initials for avatar
  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <ThemeToggle />

      {user ? (
        // ─── AUTHENTICATED USER DROPDOWN ───
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-haspopup="true"
            className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full border border-border/70 bg-card hover:bg-muted/50 transition-all shadow-2xs hover:shadow-xs focus:outline-hidden focus:ring-2 focus:ring-primary/40 cursor-pointer"
          >
            {/* Avatar Circle */}
            <div className="h-8 w-8 rounded-full bg-linear-to-tr from-primary/80 to-blue-500 text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
              {initials}
            </div>

            {/* User First Name (desktop) */}
            <div className="hidden sm:flex flex-col text-left mr-0.5">
              <span className="text-xs font-semibold text-foreground leading-tight max-w-[110px] truncate">
                {user.name}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {roleBadgeLabel}
              </span>
            </div>

            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Floating Dropdown Menu */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md p-2 shadow-xl z-50 animate-in fade-in-50 zoom-in-95 duration-150">
              {/* User Account Info Header */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50 mb-1.5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-linear-to-tr from-primary to-blue-600 text-primary-foreground font-extrabold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground truncate">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {user.email}
                    </p>
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-semibold uppercase tracking-wider py-0 px-1.5 ${roleBadgeColor}`}
                      >
                        {roleBadgeLabel}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Options */}
              <div className="space-y-0.5 py-1">
                {/* 1. Dashboard */}
                <Link
                  href={dashboardHref}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/70 transition-colors group"
                >
                  <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold block text-foreground">
                      Dashboard
                    </span>
                    <span className="text-[10px] text-muted-foreground block truncate">
                      {isAdmin
                        ? "Admin command center & management"
                        : isSubAdmin
                          ? "Sub-admin operational portal"
                          : "My applications & hiring status"}
                    </span>
                  </div>
                </Link>

                {/* 2. Profile */}
                <Link
                  href="/candidate/profile"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/70 transition-colors group"
                >
                  <div className="h-7 w-7 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <UserIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold block text-foreground">
                      My Profile
                    </span>
                    <span className="text-[10px] text-muted-foreground block truncate">
                      Candidate details, resume & info
                    </span>
                  </div>
                </Link>

                {/* 3. Careers */}
                <Link
                  href="/careers"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/70 transition-colors group"
                >
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Briefcase className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold block text-foreground">
                      Careers & Openings
                    </span>
                    <span className="text-[10px] text-muted-foreground block truncate">
                      Explore active internship roles
                    </span>
                  </div>
                </Link>

                {/* 4. Help & FAQ */}
                <Link
                  href="/help"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/70 transition-colors group"
                >
                  <div className="h-7 w-7 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold block text-foreground">
                      Help & FAQ
                    </span>
                    <span className="text-[10px] text-muted-foreground block truncate">
                      Support and platform guidance
                    </span>
                  </div>
                </Link>
              </div>

              {/* Divider */}
              <div className="h-px bg-border/60 my-1" />

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer group disabled:opacity-60"
              >
                <div className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {isSigningOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
                </div>
              </button>
            </div>
          )}
        </div>
      ) : (
        // ─── GUEST USER CTA (SIGN IN / CREATE ACCOUNT) ───
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-3">
              <Lock className="hidden sm:block h-3.5 w-3.5" aria-hidden="true" />
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Create Account</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
