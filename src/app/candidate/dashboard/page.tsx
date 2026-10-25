import React, { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { ListCardSkeleton, CardGridSkeleton } from "@/components/feedback/page-skeletons";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { CAREER_INTEREST_LABELS } from "@/features/lifecycle/services/journey-progress";
import { CareerInterestPrompt } from "@/features/lifecycle/components/career-interest-prompt";
import {
  ActiveApplicationsSection,
  EvaluationSummarySection,
  InterviewBookingRequestsSection,
  JourneySection,
  PendingOffersSection,
  ProfileCompletenessSection,
  RecommendedOpeningsSection,
  UpcomingInterviewsSection,
} from "@/features/lifecycle/components/candidate-dashboard-sections";
import { JourneySkeleton, SectionSkeleton } from "@/features/lifecycle/components/self-service-ui";
import { EmploymentPeriodsSection } from "@/features/lifecycle/components/employment-periods-section";

export const instant = false;

export const metadata = {
  title: "Dashboard — Candidate Portal",
  description: "Your applications, interviews, offers and recommended openings.",
};

export default async function CandidateDashboardPage() {
  // Candidates, evaluation-stage users and alumni (people who exited and may re-apply);
  // joined users are sent to their own home.
  const { user, lifecycle } = await requirePortalCapability("candidateOverview", {
    callbackPath: "/candidate/dashboard",
  });
  const interest = lifecycle.careerInterest;
  const firstName = user.name?.trim().split(/\s+/)[0] || "there";

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Welcome back, {firstName}</h2>
          <p className="text-sm text-muted-foreground">
            {lifecycle.stage === "EVALUATION"
              ? "You are in the supervised internship evaluation. Your workspace and applications are below."
              : lifecycle.stage === "ALUMNI"
                ? "Good to see you again. You can apply for new openings with this account; your earlier employment is kept below."
                : "Here is where your applications stand and what to do next."}
          </p>
        </div>
        {interest && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {CAREER_INTEREST_LABELS[interest]}
          </span>
        )}
      </header>

      {!interest && <CareerInterestPrompt />}

      {lifecycle.stage === "EVALUATION" && lifecycle.enrollment && (
        <Suspense
          fallback={
            <SectionSkeleton label="Loading your evaluation">
              <ListCardSkeleton rows={2} />
            </SectionSkeleton>
          }
        >
          <EvaluationSummarySection userId={user.id} enrollment={lifecycle.enrollment} />
        </Suspense>
      )}

      <Suspense fallback={<JourneySkeleton />}>
        <JourneySection userId={user.id} />
      </Suspense>

      {lifecycle.employment && (
        <Suspense
          fallback={
            <SectionSkeleton label="Loading your employment history">
              <ListCardSkeleton rows={2} />
            </SectionSkeleton>
          }
        >
          <EmploymentPeriodsSection
            userId={user.id}
            title="Your time at GARA Innovation"
            description="If you are hired again, HR re-activates the same employee record and a new period starts."
          />
        </Suspense>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Suspense
            fallback={
              <SectionSkeleton label="Loading your applications">
                <ListCardSkeleton rows={3} />
              </SectionSkeleton>
            }
          >
            <ActiveApplicationsSection userId={user.id} />
          </Suspense>
          <Suspense
            fallback={
              <SectionSkeleton label="Loading upcoming interviews">
                <ListCardSkeleton rows={2} />
              </SectionSkeleton>
            }
          >
            <UpcomingInterviewsSection userId={user.id} />
          </Suspense>
        </div>
        <div className="space-y-6">
          {/* Shown only when the hiring team offered interview times; no placeholder otherwise. */}
          <Suspense fallback={null}>
            <InterviewBookingRequestsSection userId={user.id} />
          </Suspense>
          <Suspense
            fallback={
              <SectionSkeleton label="Loading offers">
                <ListCardSkeleton rows={1} />
              </SectionSkeleton>
            }
          >
            <PendingOffersSection userId={user.id} />
          </Suspense>
          <Suspense
            fallback={
              <SectionSkeleton label="Loading profile completeness">
                <ListCardSkeleton rows={2} />
              </SectionSkeleton>
            }
          >
            <ProfileCompletenessSection userId={user.id} />
          </Suspense>
        </div>
      </div>

      <Suspense
        fallback={
          <SectionSkeleton label="Loading recommended openings">
            <CardGridSkeleton count={3} />
          </SectionSkeleton>
        }
      >
        <RecommendedOpeningsSection userId={user.id} interest={interest} />
      </Suspense>
    </div>
  );
}
