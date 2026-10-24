"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { askPortalChatbotAction } from "../actions";
import { ChatbotReply } from "../types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  RotateCcw,
  X,
  ArrowRight,
} from "lucide-react";

interface ChatTurn {
  id: number;
  question: string;
  reply?: ChatbotReply;
  errorMessage?: string;
}

const SUGGESTED_QUESTIONS = [
  "How does the 7-working-day supervised evaluation period work?",
  "How do I apply for an internship or full-time opening?",
  "When do interns receive their official GARA Intern ID card?",
  "How are internship certificates verified?",
  "What is my application status?",
];

interface PortalChatbotWidgetProps {
  isAuthenticated: boolean;
  userName?: string;
  variant?: "floating" | "embedded";
  onClose?: () => void;
}

export function PortalChatbotWidget({
  isAuthenticated,
  userName,
  variant = "embedded",
  onClose,
}: PortalChatbotWidgetProps) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [turnCounter, setTurnCounter] = useState(1);
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, isPending]);

  function submitQuery(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed || isPending) return;

    const currentTurnId = turnCounter;
    setTurnCounter((prev) => prev + 1);
    setQuestion("");

    startTransition(async () => {
      const response = await askPortalChatbotAction({ question: trimmed });
      if (response.success) {
        setTurns((prev) => [
          ...prev,
          {
            id: currentTurnId,
            question: trimmed,
            reply: response.data,
          },
        ]);
      } else {
        setTurns((prev) => [
          ...prev,
          {
            id: currentTurnId,
            question: trimmed,
            errorMessage: response.error.message,
          },
        ]);
      }
    });
  }

  const containerClasses =
    variant === "floating"
      ? "flex-1 flex flex-col h-full overflow-hidden bg-card text-foreground"
      : "rounded-3xl border border-border/80 bg-card shadow-sm overflow-hidden flex flex-col h-[600px] text-foreground";

  return (
    <div className={containerClasses}>
      {/* ── Chatbot Top Header ── */}
      <div className="px-4 py-3.5 border-b border-border/60 bg-muted/30 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
            <Bot className="h-5 w-5 text-primary" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-xs sm:text-sm text-foreground truncate">
                GARA AI Assistant
              </h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {isAuthenticated ? (userName ? `Hi, ${userName}` : "Signed In") : "Guest"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              Online • Instant Portal & FAQ Support
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => setTurns([])}
              title="Reset conversation"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close assistant"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Chat Messages Scroll Area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {turns.length === 0 ? (
          <div className="py-2 space-y-4">
            {/* Friendly Greeting */}
            <div className="rounded-2xl bg-muted/40 border border-border/50 p-4 text-center space-y-1.5">
              {/* <div className="mx-auto h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div> */}
              <h4 className="text-xs sm:text-sm font-semibold text-foreground">
                How can I help you today?
              </h4>
              <p className="text-[11px] text-muted-foreground max-w-md mx-auto leading-relaxed">
              Ask about GARA internships, evaluations, certificates, or application status.
              </p>
            </div>

            {/* Suggested Questions */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground px-1 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                Suggested Questions:
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTED_QUESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={isPending}
                    onClick={() => submitQuery(item)}
                    className="text-left text-xs p-2.5 rounded-xl border border-border/70 bg-card hover:bg-muted/60 hover:border-primary/40 text-foreground transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
                  >
                    <span className="line-clamp-2 leading-relaxed">{item}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="space-y-2.5 text-xs">
              {/* User message */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-xs bg-primary text-primary-foreground px-3.5 py-2.5 font-medium shadow-xs leading-relaxed">
                  {turn.question}
                </div>
              </div>

              {/* Bot reply */}
              <div className="flex justify-start items-start gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5" />
                </div>

                {turn.errorMessage ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tl-xs border border-destructive/40 bg-destructive/10 text-destructive p-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Notice
                    </div>
                    <p className="leading-relaxed">{turn.errorMessage}</p>
                  </div>
                ) : turn.reply ? (
                  <div className="max-w-[88%] rounded-2xl rounded-tl-xs border border-border/70 bg-muted/40 p-3.5 space-y-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          turn.reply.intent === "PROMPT_INJECTION_BLOCKED"
                            ? "destructive"
                            : turn.reply.intent === "OUT_OF_SCOPE"
                              ? "warning"
                              : "outline"
                        }
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {turn.reply.intent === "PROMPT_INJECTION_BLOCKED"
                          ? "Blocked"
                          : turn.reply.intent === "OUT_OF_SCOPE"
                            ? "Out of scope"
                            : "FAQ Reply"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        KB {turn.reply.knowledgeVersion}
                      </span>
                    </div>

                    <p className="text-foreground leading-relaxed whitespace-pre-line">
                      {turn.reply.answer}
                    </p>

                    {/* Personal status cards if present */}
                    {turn.reply.personalStatusData?.applications &&
                      turn.reply.personalStatusData.applications.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-border/50">
                          <p className="font-semibold text-[11px] text-foreground">
                            Your Applications:
                          </p>
                          {turn.reply.personalStatusData.applications.map((app) => (
                            <div
                              key={app.referenceCode}
                              className="p-2 rounded-lg bg-background border border-border/60 text-[11px] flex justify-between items-center"
                            >
                              <span className="font-medium text-foreground">
                                {app.openingTitle}
                              </span>
                              <Badge variant="secondary" className="text-[10px]">
                                {app.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}

                    {turn.reply.relatedPath && (
                      <div className="pt-1 border-t border-border/40">
                        <Link
                          href={turn.reply.relatedPath}
                          className="inline-flex items-center gap-1 text-[11px] text-primary font-medium hover:underline"
                        >
                          Open page ({turn.reply.relatedPath})
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}

        {/* Loading typing indicator */}
        {isPending && (
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-xs bg-muted/50 border border-border/60 px-3.5 py-2.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Form ── */}
      <div className="p-3 border-t border-border/60 bg-muted/20 shrink-0 space-y-1.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(question);
          }}
          className="relative flex items-center"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about GARA portal..."
            maxLength={500}
            disabled={isPending}
            className="h-10 pr-10 pl-3.5 rounded-xl border-border/80 bg-background focus-visible:ring-1 focus-visible:ring-primary text-xs shadow-xs"
            aria-label="Portal assistant question"
          />
          <button
            type="submit"
            disabled={isPending || !question.trim()}
            className="absolute right-1.5 h-7 w-7 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:hover:bg-primary text-primary-foreground flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
            aria-label="Ask"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
        {/* <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground/75">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            PII-Protected Policy Grounded
          </span>
          <span>Verified Knowledge Base</span>
        </div> */}
      </div>
    </div>
  );
}
