import { Suspense } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navigation/navbar";
import { getCurrentUser } from "@/lib/auth/guards";
import { chatbotService } from "@/features/chatbot/services/chatbot-service";
import { PortalChatbotWidget } from "@/features/chatbot/components/portal-chatbot-widget";
import { ChatPanelSkeleton } from "@/components/feedback/page-skeletons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BookOpen,
  ShieldCheck,
  ExternalLink,
  HelpCircle,
} from "lucide-react";

export const metadata = {
  title: "Help Center, Approved FAQs & Portal Assistant",
  description:
    "Official GARA Innovation Portal Help Center, versioned FAQ knowledge base, and scoped portal status assistant.",
};

export const instant = false;

/*
 * The FAQ catalogue is static, so the page shell prerenders. Only the two parts that depend
 * on the signed-in user (navbar account menu, assistant personalisation) read the session,
 * each behind its own Suspense boundary; getCurrentUser() is memoised per request.
 */

async function SessionNavbar() {
  const user = await getCurrentUser();
  return <Navbar user={user} />;
}

async function HelpAssistant() {
  const user = await getCurrentUser();
  return <PortalChatbotWidget isAuthenticated={Boolean(user)} userName={user?.name} />;
}

export default function HelpCenterPage() {
  const faqCatalog = chatbotService.getApprovedFaqs();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* The guest navbar paints with the shell; the account menu streams in for signed-in users. */}
      <Suspense fallback={<Navbar />}>
        <SessionNavbar />
      </Suspense>

      <main className="flex-1 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          {/* Header */}
          <div className="space-y-3 border-b border-border/70 pb-6">
            <h1 className="text-3xl font-extrabold tracking-tight">
              GARA Portal Help Center & Assistant
            </h1>
          </div>

          {/* Interactive Scoped Portal Assistant */}
          <section aria-label="Interactive Portal Assistant">
            <Suspense fallback={<ChatPanelSkeleton label="Loading the portal assistant" />}>
              <HelpAssistant />
            </Suspense>
          </section>

          {/* Versioned Approved FAQ Knowledge Base */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Approved Programme & Portal FAQs ({faqCatalog.version})
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {faqCatalog.entries.map((entry) => (
                <Card key={entry.id} className="flex flex-col justify-between">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">
                        {entry.category.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {entry.id}
                      </span>
                    </div>
                    <CardTitle className="text-sm leading-snug flex items-start gap-2">
                      <HelpCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{entry.question}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                    <p>{entry.answer}</p>
                    {entry.relatedPath && (
                      <div className="pt-1">
                        <Link
                          href={entry.relatedPath}
                          className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
                        >
                          Go to {entry.relatedPath}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Security & Privacy Guarantee Card */}
          <Card className="bg-muted/20 border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Assistant Security & Privacy Boundaries
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="font-semibold text-foreground mb-1">
                  1. Server-Side Status Isolation
                </p>
                <p>
                  Personal status queries authenticate your session and query only your own
                  user ID. Cross-candidate lookups are rejected with HTTP 403 Forbidden.
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">
                  2. Zero Confidential Leakage
                </p>
                <p>
                  Resumes, employee documents, payroll figures, and internal evaluation notes
                  are never exposed or transmitted to external AI providers.
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">
                  3. Replaceable Adapter Architecture
                </p>
                <p>
                  Backed by <code className="font-mono">src/infrastructure/ai/</code> with
                  deterministic fallback to versioned FAQs when external AI is unconfigured (OD-011).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
