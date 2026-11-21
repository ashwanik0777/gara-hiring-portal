import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { getSiteUrl } from "@/lib/site-url";
import { FloatingSocialDock } from "@/components/navigation/floating-social-dock";
import { FloatingActions } from "@/components/navigation/floating-actions";
import { Toaster } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const SITE_TITLE = "GARA Innovation — Careers, Internships & Verified Credentials";
const SITE_DESCRIPTION =
  "Apply for internship cohorts and full-time roles at GARA Innovation, track your application and verify GARA certificates.";

export const metadata: Metadata = {
  // Absolute base for every relative metadata URL (Open Graph images, canonical links).
  metadataBase: new URL(getSiteUrl()),
  applicationName: "GARA Innovation",
  title: {
    default: SITE_TITLE,
    template: "%s | GARA Innovation",
  },
  description: SITE_DESCRIPTION,
  // Link previews (WhatsApp, LinkedIn, Slack, X) read these tags from the server HTML; the
  // image comes from src/app/opengraph-image.tsx unless a page provides its own.
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "GARA Innovation",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/gara-logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("gara_theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d){r.classList.add("dark");r.classList.remove("light");r.style.colorScheme="dark";}else{r.classList.add("light");r.classList.remove("dark");r.style.colorScheme="light";}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased font-[family-name:var(--font-inter)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-primary-foreground focus:shadow-md"
        >
          Skip to main content
        </a>
        <div id="main-content" className="min-h-full flex flex-col flex-1">
          {children}
        </div>
        <Suspense fallback={null}>
          <FloatingSocialDock />
          <FloatingActions />
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
