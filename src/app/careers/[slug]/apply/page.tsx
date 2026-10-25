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
import { ArrowLeft, Lock, Briefcase, MapPin, Building2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { OpeningStatus } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { getApplyBlockedReason, resolveHomePath } from "@/features/lifecycle/services/lifecycle-service";

// Next.js 16 Cache Components: Allow streaming/blocking data access
export const instant = false;

interface ApplyPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const user = await getCurrentUser();

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
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
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
    const callbackUrl = `/careers/${slug}/apply`;
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="mb-6">
          <Link
            href={`/careers/${slug}`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to opening details
          </Link>
        </div>

        <Card className="border-border">
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
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card className="border-border">
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

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl space-y-8">
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

      <DynamicFormRenderer
        formSchema={formSchema}
        openingTitle={opening.title}
        openingSlug={opening.slug}
        candidateName={user.name}
        candidateEmail={user.email}
      />
    </div>
  );
}
