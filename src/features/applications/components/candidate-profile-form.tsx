"use client";

import React, { useState } from "react";
import { CandidateProfileData } from "../types";
import { updateCandidateProfileAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { CareerInterestPicker } from "@/features/lifecycle/components/career-interest-picker";
import type { CareerInterest } from "@/types/enums";

export function CandidateProfileForm({ profile }: { profile: CandidateProfileData }) {
  const [phone, setPhone] = useState(profile.phone || "");
  const [careerInterest, setCareerInterest] = useState<CareerInterest | null>(profile.careerInterest ?? null);
  const [location, setLocation] = useState(profile.location || "");
  const [currentOrganization, setCurrentOrganization] = useState(profile.currentOrganization || "");
  const [highestEducation, setHighestEducation] = useState(profile.highestEducation || "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedinUrl || "");
  const [githubUrl, setGithubUrl] = useState(profile.githubUrl || "");
  const [portfolioUrl, setPortfolioUrl] = useState(profile.portfolioUrl || "");

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors({});

    const formData = new FormData();
    formData.append("phone", phone);
    formData.append("location", location);
    formData.append("currentOrganization", currentOrganization);
    formData.append("highestEducation", highestEducation);
    formData.append("linkedinUrl", linkedinUrl);
    formData.append("githubUrl", githubUrl);
    formData.append("portfolioUrl", portfolioUrl);
    if (careerInterest) formData.append("careerInterest", careerInterest);

    try {
      const res = await updateCandidateProfileAction(formData);
      if (!res.success) {
        setErrorMessage(res.error);
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      } else {
        setSuccessMessage("Profile updated successfully");
      }
    } catch {
      setErrorMessage("Failed to update profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {successMessage && (
        <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-success flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Career Preference</CardTitle>
        </CardHeader>
        <CardContent>
          <CareerInterestPicker
            name="profile-career-interest"
            value={careerInterest}
            onChange={setCareerInterest}
            error={fieldErrors.careerInterest}
            legend="Show me openings for"
          />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Identity & Contact Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              value={profile.fullName}
              disabled
              className="bg-muted/50 cursor-not-allowed"
            />
            <Input
              label="Email Address"
              value={profile.email}
              disabled
              className="bg-muted/50 cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone Number"
              placeholder="+91 98765 43210"
              value={phone}
              error={fieldErrors.phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Current Location (City, State / Remote)"
              placeholder="e.g. Bangalore, Karnataka"
              value={location}
              error={fieldErrors.location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Education & Background</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Highest Education"
              placeholder="e.g. B.Tech Computer Science (3rd Year)"
              value={highestEducation}
              error={fieldErrors.highestEducation}
              onChange={(e) => setHighestEducation(e.target.value)}
            />
            <Input
              label="Current College / University / Organization"
              placeholder="e.g. National Institute of Technology"
              value={currentOrganization}
              error={fieldErrors.currentOrganization}
              onChange={(e) => setCurrentOrganization(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Professional & Code Profiles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="LinkedIn Profile URL"
            type="url"
            placeholder="https://linkedin.com/in/username"
            value={linkedinUrl}
            error={fieldErrors.linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
          <Input
            label="GitHub Profile URL"
            type="url"
            placeholder="https://github.com/username"
            error={fieldErrors.githubUrl}
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
          />
          <Input
            label="Personal Portfolio / Blog URL"
            type="url"
            placeholder="https://yourportfolio.dev"
            error={fieldErrors.portfolioUrl}
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
          />
        </CardContent>
        <CardFooter className="py-4 border-t border-border flex justify-end">
          <Button type="submit" isLoading={isSaving}>
            Save Profile Changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
