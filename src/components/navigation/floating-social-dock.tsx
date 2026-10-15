"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";
import { SOCIAL_LINKS, APP_EMAIL } from "@/lib/constants";
import { cn } from "@/lib/cn";

/* ── Brand SVG Icons ── */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const socialItems = [
  { name: "WhatsApp", href: SOCIAL_LINKS.whatsapp, iconComponent: WhatsAppIcon, color: "#25D366", hoverBg: "#25D366" },
  { name: "LinkedIn", href: SOCIAL_LINKS.linkedin, iconComponent: LinkedInIcon, color: "#0A66C2", hoverBg: "#0A66C2" },
  { name: "Instagram", href: SOCIAL_LINKS.instagram, iconComponent: InstagramIcon, color: "#E4405F", hoverBg: "#E4405F" },
  { name: "X", href: SOCIAL_LINKS.twitter, iconComponent: XIcon, color: undefined, className: "text-foreground dark:text-white", hoverBg: "#18181b" },
  { name: "YouTube", href: SOCIAL_LINKS.youtube, iconComponent: YouTubeIcon, color: "#FF0000", hoverBg: "#FF0000" },
  { name: "Email", href: `mailto:${APP_EMAIL}`, icon: Mail, color: "#6366f1", hoverBg: "#4f46e5" },
];

export function SocialSidebar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 200);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const pathname = usePathname();
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register");

  if (isAuthPage) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed left-0 top-1/2 -translate-y-1/2 z-40 transition-all duration-500 ease-out hidden md:block",
        visible
          ? "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-full pointer-events-none"
      )}
    >
      <div className="flex flex-col rounded-r-2xl overflow-hidden shadow-[3px_0_20px_rgba(0,0,0,0.08)] dark:shadow-[3px_0_20px_rgba(0,0,0,0.3)] border border-l-0 border-border/80 bg-card/95 backdrop-blur-md">
        {socialItems.map((item) => {
          const Icon = item.icon;
          const IconComp = item.iconComponent;
          return (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.name}
              className="group relative flex items-center justify-center w-11 h-11 m-0.5 transition-all duration-300 overflow-hidden rounded-2xl cursor-pointer"
            >
              {/* Hover background fill */}
              <div
                className="absolute inset-0 rounded-2xl transition-all duration-300 scale-0 group-hover:scale-100 origin-center"
                style={{ backgroundColor: item.hoverBg }}
              />

              {/* Icon */}
              <div
                className={cn(
                  "relative z-10 transition-all duration-300 group-hover:scale-110",
                  item.className
                )}
                style={item.color ? { color: item.color } : undefined}
              >
                {IconComp ? (
                  <IconComp className="w-4 h-4 transition-colors duration-300 group-hover:!text-white" />
                ) : Icon ? (
                  <Icon className="w-4 h-4 transition-colors duration-300 group-hover:text-white" strokeWidth={2} />
                ) : null}
              </div>

              {/* Tooltip */}
              <span
                className="absolute left-full ml-2 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-x-1 group-hover:translate-x-0 shadow-lg"
                style={{ backgroundColor: item.hoverBg }}
              >
                {item.name}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// Alias for backward compatibility
export const FloatingSocialDock = SocialSidebar;
