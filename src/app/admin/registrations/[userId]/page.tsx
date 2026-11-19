import { renderRegistrantDetailPage } from "@/features/reports/components/registrations-routes";

export const instant = false;

// No personal data in the document title.
export const metadata = {
  title: "Registrant — Admin Console",
  description: "What a registrant entered at sign-up and in their candidate profile.",
};

interface RegistrantDetailPageProps {
  params: Promise<{ userId: string }>;
}

/** One registrant's details (audited); the route authorizes itself. */
export default async function AdminRegistrantDetailPage({ params }: RegistrantDetailPageProps) {
  return renderRegistrantDetailPage("/admin", params);
}
