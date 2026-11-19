import { ShieldAlert } from "lucide-react";
import { COMPANY, fraudAlertText } from "@/config/site";

/**
 * Fraud alert: internships at GARA are always free, so anyone asking for an internship fee
 * is not GARA. Shown on the home page, internship pages and in the footer. No hooks, so it
 * renders on the server and inside client components alike.
 */
export function FraudAlert({ variant = "banner", className = "" }: { variant?: "banner" | "compact"; className?: string }) {
  const text = fraudAlertText();
  const [beforeEmail] = text.split(COMPANY.contactEmail);

  const message = (
    <>
      {beforeEmail}
      <a
        href={`mailto:${COMPANY.contactEmail}`}
        className="font-semibold underline underline-offset-2 hover:text-foreground"
      >
        {COMPANY.contactEmail}
      </a>
      .
    </>
  );

  if (variant === "compact") {
    return (
      <p role="note" className={`flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground ${className}`}>
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-foreground">Fraud alert: </strong>
          {message}
        </span>
      </p>
    );
  }

  return (
    <div
      role="note"
      aria-label="Fraud alert"
      className={`flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100 ${className}`}
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <p className="leading-relaxed">
        <strong className="font-semibold">Fraud alert: </strong>
        {message}
      </p>
    </div>
  );
}
