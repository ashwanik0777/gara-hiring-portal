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
  ShieldCheck,
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
      {/* KPI Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: AI Assistant Status */}
        <div className="bg-card border border-border/70 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Assistant Engine
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-sm font-bold text-foreground">Rule-Gated AI Core</p>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Deterministic & Fast
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200/50 dark:border-blue-900/50">
            <Bot className="h-5 w-5" />
          </div>
        </div>

        {/* Card 2: Knowledge Base Version */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Approved FAQs
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {faqCatalog.entries.length}
            </p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
              Catalog {faqCatalog.version}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/50 dark:border-emerald-900/50">
            <BookOpen className="h-5 w-5" />
          </div>
        </div>

        {/* Card 3: Governance Policy */}
        <div className="bg-card border border-border/70 border-l-4 border-l-violet-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Governance Gate
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px] py-0 font-mono">
                OD-012 Compliant
              </Badge>
            </div>
            <p className="text-[11px] text-violet-600 dark:text-violet-400 mt-0.5 font-medium">
              Zero-PII Data Boundary
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0 border border-violet-200/50 dark:border-violet-900/50">
            <Lock className="h-5 w-5" />
          </div>
        </div>

        {/* Card 4: Response Latency */}
        <div className="bg-card border border-border/70 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Query Latency
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              &lt; 50ms
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
              Local Memory Index
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200/50 dark:border-amber-900/50">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Assistant Console + Knowledge Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Interactive Assistant Widget (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Interactive Portal Assistant Console
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Test system queries, candidate status lookups, and evaluation policies
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px] gap-1 font-mono">
                <ShieldCheck className="h-3 w-3 text-emerald-500" /> Live
              </Badge>
            </div>

            <PortalChatbotWidget
              isAuthenticated={true}
              userName={user.name || "Administrator"}
            />
          </div>
        </div>

        {/* Policy Knowledge Base Directory (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Versioned Knowledge Base ({faqCatalog.version})
                </h3>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {faqCatalog.entries.length} Topics
              </Badge>
            </div>

            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {faqCatalog.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl border border-border/60 bg-muted/20 dark:bg-muted/10 space-y-1.5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                      {entry.category}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {entry.id}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground">
                    {entry.question}
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
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
