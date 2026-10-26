import Link from "next/link";
import Image from "next/image";
import { Briefcase, CheckCircle, HelpCircle } from "lucide-react";
import { NavbarAuthActions } from "./navbar-auth-actions";
import { LinkPendingReporter, NavigationProgressBar } from "./navigation-progress";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const PUBLIC_NAV_LINKS = [
  { href: "/careers", label: "Careers & Openings", icon: Briefcase },
  { href: "/verify", label: "Verify Certificate", icon: CheckCircle },
  { href: "/help", label: "Help & FAQ", icon: HelpCircle },
] as const;

export function Navbar({ user }: { user?: AuthenticatedUser | null }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-card/85 backdrop-blur-md">
      {/* Thin top bar while a navigation from one of the reporting links is pending. */}
      <NavigationProgressBar />

      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Title */}
        <Link href="/" className="flex min-w-0 items-center gap-3 group">
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
          <span className="hidden min-[400px]:inline font-bold text-base leading-tight tracking-tight text-foreground group-hover:text-primary transition-colors">
            GARA Innovation
          </span>
          <LinkPendingReporter />
        </Link>

        {/* Public Navigation Links (default prefetch: the destination's App Shell) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {PUBLIC_NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon className="h-4 w-4" />
              {label}
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
