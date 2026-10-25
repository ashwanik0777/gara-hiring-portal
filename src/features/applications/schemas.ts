import { z } from "zod";
import { CareerInterestSchema } from "@/features/lifecycle/schemas";

export const CandidateProfileSchema = z.object({
  phone: z.string().max(30).optional().nullable(),
  location: z.string().max(150).optional().nullable(),
  currentOrganization: z.string().max(200).optional().nullable(),
  highestEducation: z.string().max(100).optional().nullable(),
  linkedinUrl: z.string().url("Please enter a valid LinkedIn URL").refine((u) => u.startsWith("https://") || u.startsWith("http://"), { message: "URL must start with http:// or https://" }).or(z.literal("")).optional().nullable(),
  githubUrl: z.string().url("Please enter a valid GitHub URL").refine((u) => u.startsWith("https://") || u.startsWith("http://"), { message: "URL must start with http:// or https://" }).or(z.literal("")).optional().nullable(),
  portfolioUrl: z.string().url("Please enter a valid URL").refine((u) => u.startsWith("https://") || u.startsWith("http://"), { message: "URL must start with http:// or https://" }).or(z.literal("")).optional().nullable(),
  careerInterest: CareerInterestSchema.optional(),
});

export type CandidateProfileInput = z.infer<typeof CandidateProfileSchema>;
