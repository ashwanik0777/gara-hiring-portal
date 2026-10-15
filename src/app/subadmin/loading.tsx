import React from "react";
import { Loader2 } from "lucide-react";

export default function SubAdminLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading Sub-Admin portal...</p>
    </div>
  );
}
