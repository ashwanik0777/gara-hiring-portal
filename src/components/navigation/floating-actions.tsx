"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Heart, MessageSquare, X, Star, Send, CheckCircle2 } from "lucide-react";
import { PortalChatbotWidget } from "@/features/chatbot/components/portal-chatbot-widget";
import { APP_EMAIL } from "@/lib/constants";

export function FloatingActions() {
  const pathname = usePathname();
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register");

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);

  // Feedback form state
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 240);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Feedback is not stored by the portal: it is handed to the user's email app.
  function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = feedbackText.trim().slice(0, 2000);
    if (!text) return;
    const subject = encodeURIComponent("Portal feedback");
    const body = encodeURIComponent(`Rating: ${rating}/5\n\n${text}`);
    window.location.href = `mailto:${APP_EMAIL}?subject=${subject}&body=${body}`;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFeedbackText("");
      setFeedbackOpen(false);
    }, 2000);
  }

  if (isAuthPage) {
    return null;
  }

  return (
    <>
      {/* Floating Action Buttons Container (Bottom Right) */}
      <div className="fixed bottom-5 right-4 sm:right-6 z-50 flex flex-col items-center gap-2.5">
        {/* Scroll to Top */}
        {showScrollTop && (
          <button
            type="button"
            onClick={scrollToTop}
            title="Scroll to top"
            aria-label="Scroll to top"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card/90 backdrop-blur-md border border-border/80 shadow-md text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 cursor-pointer animate-fade-in hover:-translate-y-0.5"
          >
            <ArrowUp className="h-4.5 w-4.5" />
          </button>
        )}

        {/* Feedback Button (Hot Pink Heart) */}
        <button
          type="button"
          onClick={() => {
            setFeedbackOpen((prev) => !prev);
            setChatbotOpen(false);
          }}
          title="Share Feedback"
          aria-label="Share Feedback"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/25 transition-all duration-200 hover:scale-108 cursor-pointer hover:-translate-y-0.5"
        >
          <Heart className="h-4.5 w-4.5 fill-current" />
        </button>

        {/* Chatbot Button (Blue Speech Bubble) */}
        <button
          type="button"
          onClick={() => {
            setChatbotOpen((prev) => !prev);
            setFeedbackOpen(false);
          }}
          title="Ask GARA AI Assistant"
          aria-label="Ask GARA AI Assistant"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary hover:bg-primary-hover text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-200 hover:scale-108 cursor-pointer hover:-translate-y-0.5"
        >
          {chatbotOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <MessageSquare className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* ──────────────── FEEDBACK MODAL ──────────────── */}
      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-card border border-border/80 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                  <Heart className="h-4.5 w-4.5 fill-current" />
                </div>
                <h3 className="text-base font-bold text-foreground">Share Feedback</h3>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {submitted ? (
              <div className="py-8 text-center space-y-2 animate-fade-in">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="font-semibold text-foreground">Your email app has been opened</p>
                <p className="text-xs text-muted-foreground">Send the prepared message to share your feedback with GARA Innovation.</p>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="space-y-4 pt-1">
                {/* Star rating */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    How was your experience?
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1 text-muted-foreground hover:scale-115 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`h-6 w-6 ${
                            star <= rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/40"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Feedback textarea */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Your comments or suggestions
                  </label>
                  <textarea
                    rows={4}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell us what you loved or what we can enhance..."
                    required
                    className="w-full rounded-xl border border-border/80 bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setFeedbackOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 shadow-sm transition-colors cursor-pointer"
                  >
                    <Send className="h-3 w-3" />
                    Send via Email
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ──────────────── FLOATING CHATBOT DRAWER ──────────────── */}
      {chatbotOpen && (
        <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-[94vw] sm:w-[420px] h-[580px] max-h-[85vh] rounded-3xl bg-card border border-border/80 shadow-2xl overflow-hidden flex flex-col animate-scale-in">
          <PortalChatbotWidget
            isAuthenticated={false}
            variant="floating"
            onClose={() => setChatbotOpen(false)}
          />
        </div>
      )}
    </>
  );
}
