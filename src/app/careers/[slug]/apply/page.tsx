import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getPublicOpeningBySlug } from "@/features/openings/services/opening-service";
import { DynamicFormRenderer } from "@/features/application-forms/components/dynamic-form-renderer";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { ArrowLeft, Lock, Briefcase, MapPin, Building2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { OpeningStatus } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { formatDeadline, isApplicationWindowClosed } from "@/features/openings/listing";
import { getApplyBlockedReason, resolveHomePath } from "@/features/lifecycle/services/lifecycle-service";
import { env } from "@/lib/env";
import { pickAttributionParams, toAttributionQuery } from "@/features/applications/source-tracking";
import { ApplicationSourceFields } from "@/features/applications/components/application-source-fields";
import { ApplicantDetailsFields } from "@/features/applications/components/applicant-details-fields";

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

interface ApplyPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApplyPage({ params, searchParams }: ApplyPageProps) {
  const { slug } = await params;
  const user = await getCurrentUser();
  // Sanitized campaign parameters carried from the opening link (kept through sign-in).
  const attribution = pickAttributionParams(await searchParams);

  let opening: Awaited<ReturnType<typeof getPublicOpeningBySlug>>;
  try {
    opening = await getPublicOpeningBySlug(slug);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  if (!opening || opening.status !== OpeningStatus.PUBLISHED) {
    notFound();
  }

  // The deadline is checked again on submit (application-service); this only explains it early.
  if (opening.applyDeadline && isApplicationWindowClosed(opening.applyDeadline, new Date())) {
    return (
      <div className={`${PAGE_GUTTER} py-16 text-center space-y-6`}>
        <h1 className="text-2xl font-bold text-foreground">Applications Closed</h1>
        <p className="text-sm text-muted-foreground">
          Applications for {opening.title} closed on {formatDeadline(opening.applyDeadline)}.
        </p>
        <Link href="/careers">
          <Button variant="outline">See open roles</Button>
        </Link>
      </div>
    );
  }

  // Fetch the active published form version
  const formVersion = await prisma.openingFormVersion.findFirst({
    where: {
      openingId: opening.id,
      isPublished: true,
    },
    orderBy: { versionNumber: "desc" },
  });

  if (!formVersion) {
    return (
      <div className={`${PAGE_GUTTER} py-16 text-center`}>
        <h1 className="text-2xl font-bold text-foreground">Application Form Not Configured</h1>
        <div className="mt-6">
          <Link href={`/careers/${slug}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Opening
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const formSchema = formVersion.schemaDefinition as unknown as FormSchemaDefinition;

  // Enforce Candidate Account Requirement
  if (!user) {
    const callbackUrl = `/careers/${slug}/apply${toAttributionQuery(attribution)}`;
    return (
      <div className={`${PAGE_GUTTER} py-12`}>
        <div className="mx-auto mb-6 max-w-2xl">
          <Link
            href={`/careers/${slug}`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to opening details
          </Link>
        </div>

        <Card className="border-border mx-auto max-w-2xl">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Candidate Account Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="p-4 rounded-lg bg-muted text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground">Why do I need an account?</div>
              <p>
                An account enables you to securely track your application status, receive interview invitations, review feedback milestones, and access verified internship records.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="w-full">
                <Button className="w-full">Sign In to Continue</Button>
              </Link>
              <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="w-full">
                <Button variant="outline" className="w-full">Create Account</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const applyBlockedReason = await getApplyBlockedReason(user);
  if (applyBlockedReason) {
    const homePath = await resolveHomePath(user);
    return (
      <div className={`${PAGE_GUTTER} py-12`}>
        <Card className="border-border mx-auto max-w-2xl">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl">Applications Not Available</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 text-center">
            <p className="text-sm text-muted-foreground">{applyBlockedReason}</p>
            <Link href={homePath} className="inline-block">
              <Button>Go to my workspace</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Education details prefill the form; one application per opening (also enforced on submit).
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      branch: true,
      yearOfStudy: true,
      graduationYear: true,
      college: { select: { id: true, name: true } },
    },
  });
  const previousApplication = profile
    ? await prisma.application.findUnique({
        where: { openingId_candidateId: { openingId: opening.id, candidateId: profile.id } },
        select: { id: true, referenceCode: true },
      })
    : null;

  return (
    <div className={`${PAGE_GUTTER} py-10 space-y-8`}>
      <div>
        <Link
          href={`/careers/${slug}`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to opening details
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{opening.type}</Badge>
              <Badge variant="secondary">{opening.department}</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Apply: {opening.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> GARA Innovation
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {opening.location} ({opening.workplaceType.toLowerCase()})
              </span>
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Form Version v{formVersion.versionNumber}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
        <div className="lg:col-span-8">
          <DynamicFormRenderer
            formSchema={formSchema}
            openingTitle={opening.title}
            openingSlug={opening.slug}
            documentMode={env.DOCUMENT_STORAGE_MODE}
            candidateName={user.name}
            candidateEmail={user.email}
            previousApplication={previousApplication}
            applicantFields={
              <ApplicantDetailsFields
                isInternship={opening.type === "INTERNSHIP"}
                currentYear={new Date().getFullYear()}
                defaults={{
                  college: profile?.college ?? null,
                  branch: profile?.branch ?? null,
                  yearOfStudy: profile?.yearOfStudy ?? null,
                  graduationYear: profile?.graduationYear ?? null,
                }}
              />
            }
            attributionFields={<ApplicationSourceFields attribution={attribution} />}
          />
        </div>

        {/* Opening summary beside the form on large screens (the header shows it on phones). */}
        <aside className="hidden lg:block lg:col-span-4">
          <Card className="sticky top-6">
            <CardContent className="p-6 space-y-4 text-sm">
              <h2 className="text-base font-bold tracking-tight text-foreground">{opening.title}</h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Department</dt>
                  <dd className="font-medium text-foreground">{opening.department}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Location</dt>
                  <dd className="font-medium text-foreground">{opening.location}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Work mode</dt>
                  <dd className="font-medium text-foreground capitalize">
                    {opening.workplaceType.replace("_", "-").toLowerCase()}
                  </dd>
                </div>
              </dl>
              <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
                Your name and email are filled in from your account. Fields marked * are required.
              </p>
              <Link
                href={`/careers/${slug}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-4"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Read the full opening
              </Link>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
