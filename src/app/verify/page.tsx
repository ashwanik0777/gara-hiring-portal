import { Metadata } from "next";
import { VerificationPortal } from "@/components/verification/verification-portal";

export const metadata: Metadata = {
  title: "Verify Certificate",
  description:
    "Verify official internship certificates and completion credentials issued by GARA Innovation via our central public registry.",
};

export default function VerifyIndexPage() {
  return <VerificationPortal />;
}
