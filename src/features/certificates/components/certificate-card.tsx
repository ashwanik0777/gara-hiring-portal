"use client";

import React from "react";
import Link from "next/link";
import { CertificateDetail, CertificateStatus } from "../types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award,
  Download,
  ExternalLink,
  ShieldCheck,
  Calendar,
  UserCheck,
} from "lucide-react";

interface CertificateCardProps {
  certificate: CertificateDetail;
}

export function CertificateCard({ certificate }: CertificateCardProps) {
  const isRevoked = certificate.status === CertificateStatus.REVOKED;

  return (
    <Card className="border-border shadow-sm overflow-hidden">
      <div className="h-2 bg-primary" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Official Completion Certificate
              </CardTitle>
            </div>
          </div>

          <Badge variant={isRevoked ? "destructive" : "success"}>
            {isRevoked ? "Revoked" : "Active & Verified"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg border border-border bg-muted/20">
            <span className="text-muted-foreground block text-[11px]">Recipient</span>
            <span className="font-semibold text-foreground text-sm block mt-0.5">
              {certificate.recipientName}
            </span>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/20">
            <span className="text-muted-foreground block text-[11px]">Programme</span>
            <span className="font-semibold text-foreground text-sm block mt-0.5">
              {certificate.programmeTitle}
            </span>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/20 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <div>
              <span className="text-muted-foreground block text-[11px]">Completed On</span>
              <span className="font-medium text-foreground">
                {new Date(certificate.completionDate).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/20 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary shrink-0" />
            <div>
              <span className="text-muted-foreground block text-[11px]">Signatory</span>
              <span className="font-medium text-foreground">
                {certificate.signatoryName} ({certificate.signatoryTitle})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border">
          <Link
            href={`/verify/${certificate.verificationCode}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            <ShieldCheck className="h-4 w-4" />
            Public Verification Portal
            <ExternalLink className="h-3 w-3" />
          </Link>

          <a
            href={`/api/certificates/${certificate.id}/download`}
            download
          >
            <Button size="sm" variant="primary" className="gap-1.5">
              <Download className="h-4 w-4" />
              Download Official PDF
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
