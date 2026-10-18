import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { chatbotService } from "@/features/chatbot/services/chatbot-service";
import { PortalChatbotWidget } from "@/features/chatbot/components/portal-chatbot-widget";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  BookOpen,
  Sparkles,
  Lock,
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
      {/* ─── KPI Metric Overview Cards (Clean & Subtitle-Free) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: AI Assistant Status */}
        <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Assistant Engine
            </span>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-base sm:text-lg font-bold text-foreground">Rule-Gated AI Core</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                Active & Ready
              </Badge>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5" />
          </div>
        </div>

        {/* Card 2: Knowledge Base Version */}
        <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Approved FAQs
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight mt-1">
              {faqCatalog.entries.length}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                Catalog {faqCatalog.version}
              </Badge>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
        </div>

        {/* Card 3: Governance Policy */}
        <div className="bg-card border border-border/80 border-l-4 border-l-violet-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Governance Policy
            </span>
            <div className="text-base sm:text-lg font-bold font-mono text-foreground mt-1.5">
              OD-012 Compliant
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
              <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
                Zero-PII Safe
              </Badge>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5" />
          </div>
        </div>

        {/* Card 4: Response Latency */}
        <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Query Latency
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight mt-1">
              &lt; 50ms
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                Local Memory Index
              </Badge>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>
      </div>

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
