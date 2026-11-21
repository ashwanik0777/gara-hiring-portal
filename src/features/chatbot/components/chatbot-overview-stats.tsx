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
    </div>
  );
}
