import { redirect } from "next/navigation";

export const instant = false;

export default function CandidateRootPage() {
  redirect("/candidate/dashboard");
}
