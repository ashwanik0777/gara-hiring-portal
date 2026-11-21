import React from "react";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      {/* Pages set their own spacing (the registry page has a full-width hero). */}
      <main className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </div>
  );
}
