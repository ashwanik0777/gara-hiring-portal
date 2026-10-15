import * as React from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UnauthorizedStateProps {
  title?: string;
  message?: string;
  className?: string;
}

export function UnauthorizedState({
  title = "Access Restricted",
  message = "You do not have the required permissions to view this portal or perform this action.",
  className,
}: UnauthorizedStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center border border-border rounded-xl bg-card min-h-[260px] max-w-lg mx-auto shadow-xs",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning mb-4">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">{message}</p>
      <div className="flex gap-3">
        <Link href="/">
          <Button variant="outline" size="sm">
            Back to Home
          </Button>
        </Link>
        <Link href="/login">
          <Button size="sm">Sign In with Permitted Account</Button>
        </Link>
      </div>
    </div>
  );
}
