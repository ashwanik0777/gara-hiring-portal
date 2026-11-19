import { renderRegistrationsPage } from "@/features/reports/components/registrations-routes";

export const instant = false;

export const metadata = {
  title: "Registrations — Admin Console",
  description: "Everyone who created a candidate account and what they entered at sign-up.",
};

interface RegistrationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Registrant list (ADMIN, or HR with the reports permission); the route authorizes itself. */
export default async function AdminRegistrationsPage({ searchParams }: RegistrationsPageProps) {
  return renderRegistrationsPage("/admin", searchParams);
}
