import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { chatbotService } from "@/features/chatbot/services/chatbot-service";
import { PortalChatbotWidget } from "@/features/chatbot/components/portal-chatbot-widget";
import { ChatbotOverviewStats } from "@/features/chatbot/components/chatbot-overview-stats";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
} from "lucide-react";

export const instant = false;

export const metadata = {
  title: "Chatbot Support & Policy Assistant — Admin Console",
  description: "Administrative interactive chatbot assistant and versioned policy knowledge base.",
};

export default async function AdminChatbotPage() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes(Role.ADMIN)) {
    redirect("/admin");
  }

  const faqCatalog = chatbotService.getApprovedFaqs();

  return (
    <div className="w-full space-y-6">
      <ChatbotOverviewStats />

      {/* ─── Main Grid: Single Clean Chatbot (No Wrapper Cover) + Knowledge Base ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Direct Interactive Assistant Widget (7 cols) - Zero Redundant Double Layer */}
        <div className="lg:col-span-7">
          <PortalChatbotWidget
            isAuthenticated={true}
            userName={user.name || "Administrator"}
          />
        </div>

        {/* Policy Knowledge Base Directory (5 cols) - Matching Height & Styling */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-border/80 bg-card shadow-sm p-4 sm:p-5 h-[600px] flex flex-col">
            <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h3 className="text-xs sm:text-sm font-bold text-foreground">
                  Policy Knowledge Base
                </h3>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {faqCatalog.entries.length} Topics
              </Badge>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
              {faqCatalog.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">
                      {entry.category}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {entry.id}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground leading-snug">
                    {entry.question}
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {entry.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
