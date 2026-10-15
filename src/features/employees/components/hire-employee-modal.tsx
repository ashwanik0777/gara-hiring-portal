"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { hireEmployeeFromApplicationAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { UserPlus, AlertCircle, X, ShieldCheck } from "lucide-react";

interface HireEmployeeModalProps {
  applicationId: string;
  candidateName: string;
  defaultDepartment: string;
  defaultDesignation: string;
  defaultJoiningDate: string;
  onClose: () => void;
}

export function HireEmployeeModal({
  applicationId,
  candidateName,
  defaultDepartment,
  defaultDesignation,
  defaultJoiningDate,
  onClose,
}: HireEmployeeModalProps) {
  const router = useRouter();
  const [employeeCode, setEmployeeCode] = useState("GARA-EMP-001");
  const [department, setDepartment] = useState(defaultDepartment);
  const [designation, setDesignation] = useState(defaultDesignation);
  const [joiningDate, setJoiningDate] = useState(defaultJoiningDate);
  const [personalPhone, setPersonalPhone] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecRel, setEcRel] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("employeeCode", employeeCode);
    formData.append("department", department);
    formData.append("designation", designation);
    formData.append("joiningDate", joiningDate);
    formData.append("personalPhone", personalPhone);
    formData.append("emergencyContactName", ecName);
    formData.append("emergencyContactRelation", ecRel);
    formData.append("emergencyContactPhone", ecPhone);
    formData.append("internalNotes", internalNotes);

    try {
      const res = await hireEmployeeFromApplicationAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        onClose();
        router.push("/recruitment/employees");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="border-border shadow-lg max-w-xl w-full my-8">
        <form onSubmit={handleSubmit}>
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" /> Hire Employee: {candidateName}
                </CardTitle>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-2.5 rounded bg-muted/40 border border-border/40 text-[11px] text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success shrink-0" />
              <span>
                Gated transition: This operation requires verified OFFER_ACCEPTED status. Creating an employee record will assign the official EMPLOYEE role, initiate the onboarding checklist, and transition recruitment to HIRED.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Employee Code <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="e.g. GARA-EMP-001"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Official Joining Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Department <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Designation <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <div className="font-semibold text-foreground mb-2">
                Confidential Employee Details (Restricted RBAC):
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Personal Phone
                  </label>
                  <input
                    type="tel"
                    value={personalPhone}
                    onChange={(e) => setPersonalPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background"
                  />
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={ecName}
                    onChange={(e) => setEcName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Relationship
                  </label>
                  <input
                    type="text"
                    value={ecRel}
                    onChange={(e) => setEcRel(e.target.value)}
                    placeholder="e.g. Spouse, Parent"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background"
                  />
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Emergency Phone
                  </label>
                  <input
                    type="tel"
                    value={ecPhone}
                    onChange={(e) => setEcPhone(e.target.value)}
                    placeholder="+91 9123456789"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-medium text-foreground mb-1">
                Internal HR / Onboarding Notes
              </label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Initial setup notes, mentor pairing, equipment dispatch..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background resize-y"
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2 border-t border-border/50 flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating Employee..." : "Confirm & Hire Employee"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
