import Link from "next/link";
import Image from "next/image";
import { Briefcase, CheckCircle, GraduationCap, HelpCircle, Users } from "lucide-react";
import { NavbarAuthActions } from "./navbar-auth-actions";
import { LinkPendingReporter, NavigationProgressBar } from "./navigation-progress";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";

/** Full labels from 2xl; shorter ones below, where five links share the header with the logo. */
const PUBLIC_NAV_LINKS = [
  { href: "/careers", label: "Careers", short: "Careers", icon: Briefcase },
  { href: "/training", label: "Industrial Training", short: "Training", icon: GraduationCap },
  { href: "/campus-ambassador", label: "Campus Ambassador", short: "Ambassador", icon: Users },
  { href: "/verify", label: "Verify Certificate", short: "Verify", icon: CheckCircle },
  { href: "/help", label: "Help & FAQ", short: "Help", icon: HelpCircle },
] as const;

export function Navbar({ user }: { user?: AuthenticatedUser | null }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-card/85 backdrop-blur-md">
      {/* Thin top bar while a navigation from one of the reporting links is pending. */}
      <NavigationProgressBar />

      <div className={`${PAGE_GUTTER} flex h-16 items-center justify-between gap-3`}>
        {/* Brand Logo & Title */}
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3 group">
          <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-border/60 bg-white p-0.5 shadow-2xs">
            <Image
              src="/brand/gara-logo.png"
              alt="GARA Innovation Logo"
              width={40}
              height={40}
              className="object-contain w-full h-full"
              priority
            />
          </div>
          {/* The logo alone names the link on narrow phones, leaving room for the sign-in actions. */}
          <span className="hidden min-[400px]:inline whitespace-nowrap font-bold text-base leading-tight tracking-tight text-foreground group-hover:text-primary transition-colors">
            GARA Innovation
          </span>
          <LinkPendingReporter />
        </Link>

        {/* Public Navigation Links (default prefetch: the destination's App Shell) */}
        {/* From lg up (narrower headers have no room for the links without wrapping). */}
        <nav className="hidden lg:flex items-center gap-4 xl:gap-6 text-sm font-medium whitespace-nowrap">
          {PUBLIC_NAV_LINKS.map(({ href, label, short, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon className="hidden 2xl:block h-4 w-4" aria-hidden="true" />
              {short === label ? (
                label
              ) : (
                <>
                  <span className="2xl:hidden">{short}</span>
                  <span className="hidden 2xl:inline">{label}</span>
                </>
              )}
              <LinkPendingReporter />
            </Link>
          ))}
        </nav>

        {/* Auth CTA Actions / User Profile Dropdown & Theme Toggle */}
        <NavbarAuthActions initialUser={user} />
      </div>
    </header>
  );
}
