import React from "react";
import { BookOpen, Layers, ShieldCheck } from "lucide-react";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { chatbotService } from "../services/chatbot-service";

/**
 * Figures for the staff chatbot pages. Only measured facts are shown: the approved FAQ
 * catalogue size, its topics and version. The assistant answers from that catalogue and
 * the signed-in person's own records; no external AI model is configured (OD-011).
 */
export function ChatbotOverviewStats() {
  const catalog = chatbotService.getApprovedFaqs();
  const topicCount = new Set(catalog.entries.map((entry) => entry.category)).size;

  return (
    <div className="space-y-3">
      <StatGrid columns={2} label="Assistant knowledge base">
        <StatCard
          label="Approved FAQs"
          value={catalog.entries.length}
          icon={BookOpen}
          tone="emerald"
          hint={`Catalogue ${catalog.version}`}
        />
        <StatCard label="Topics" value={topicCount} icon={Layers} tone="blue" hint="FAQ categories covered" />
      </StatGrid>
      <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        Answers come only from the approved FAQ catalogue and the signed-in person&apos;s own records. Personal
        details are removed from questions before they are matched, and no external AI model is used (the provider
        decision OD-011 is open).
      </p>
    </div>
  );
}
