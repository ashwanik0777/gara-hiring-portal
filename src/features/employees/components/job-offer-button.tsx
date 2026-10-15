"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Briefcase } from "lucide-react";
import { JobOfferModal } from "./job-offer-modal";

interface JobOfferButtonProps {
  applicationId: string;
  candidateName: string;
  department: string;
  designation: string;
}

export function JobOfferButton({
  applicationId,
  candidateName,
  department,
  designation,
}: JobOfferButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-xs"
      >
        <Briefcase className="h-3.5 w-3.5" /> Prepare Full-Time Job Offer
      </Button>

      {open && (
        <JobOfferModal
          applicationId={applicationId}
          candidateName={candidateName}
          defaultDepartment={department}
          defaultDesignation={designation}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
