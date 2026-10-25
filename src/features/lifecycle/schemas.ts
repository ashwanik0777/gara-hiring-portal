import { z } from "zod";

export const CareerInterestSchema = z.enum(["JOB", "INTERNSHIP", "BOTH"], {
  message: "Please choose whether you are looking for a job, an internship, or both.",
});

export const SaveCareerInterestSchema = z.object({
  careerInterest: CareerInterestSchema,
});
