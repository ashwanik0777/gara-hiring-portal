import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { FloatingSocialDock } from "@/components/navigation/floating-social-dock";
import { FloatingActions } from "@/components/navigation/floating-actions";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "GARA Innovation — Recruitment, Internship & HRMS Platform",
    template: "%s | GARA Innovation",
  },
  description:
    "Enterprise Recruitment, Internship Lifecycle and HRMS Platform for GARA Innovation.",
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
      </body>
    </html>
  );
}
