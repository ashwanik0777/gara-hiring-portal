import Link from "next/link";
import Image from "next/image";
import { Briefcase, CheckCircle, HelpCircle } from "lucide-react";
import { NavbarAuthActions } from "./navbar-auth-actions";
import type { AuthenticatedUser } from "@/lib/auth/guards";

export function Navbar({ user }: { user?: AuthenticatedUser | null }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-card/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Title */}
        <Link href="/" className="flex items-center gap-3 group">
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
          <span className="font-bold text-base leading-tight tracking-tight text-foreground group-hover:text-primary transition-colors">
            GARA Innovation
          </span>
        </Link>

        {/* Public Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            href="/careers"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Briefcase className="h-4 w-4" />
            Careers & Openings
          </Link>
          <Link
            href="/verify"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            Verify Certificate
          </Link>
          <Link
            href="/help"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
            Help & FAQ
          </Link>
        </nav>

        {/* Auth CTA Actions / User Profile Dropdown & Theme Toggle */}
        <NavbarAuthActions initialUser={user} />
      </div>
    </header>
  );
}
