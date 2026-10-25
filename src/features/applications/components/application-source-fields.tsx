import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ATTRIBUTION_FORM_FIELDS,
  ATTRIBUTION_PARAM_KEYS,
  HEARD_ABOUT_US_OPTIONS,
  type AttributionParams,
} from "../source-tracking";

interface ApplicationSourceFieldsProps {
  /** Sanitized campaign parameters carried from the opening link (may be empty). */
  attribution: AttributionParams;
}

/**
 * Optional "How did you hear about us?" question plus hidden campaign parameters, rendered
 * inside the apply form. Plain markup (no state): the form forwards these named fields to
 * the submit action, which normalizes them on the server.
 */
export function ApplicationSourceFields({ attribution }: ApplicationSourceFieldsProps) {
  const selectId = "application-heard-from";
  const hintId = `${selectId}-hint`;

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-lg">One last question</CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-1.5">
        <label htmlFor={selectId} className="block text-sm font-medium text-foreground">
          How did you hear about us? <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <select
          id={selectId}
          name={ATTRIBUTION_FORM_FIELDS.heardFrom}
          defaultValue=""
          aria-describedby={hintId}
          className="w-full h-10 rounded-xl border border-input bg-card px-3 text-sm text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
        >
          <option value="">Prefer not to say</option>
          {HEARD_ABOUT_US_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p id={hintId} className="text-xs text-muted-foreground">
          We only use this to understand which channels help people find our openings.
        </p>
        {ATTRIBUTION_PARAM_KEYS.map((key) =>
          attribution[key] ? (
            <input key={key} type="hidden" name={ATTRIBUTION_FORM_FIELDS[key]} value={attribution[key]} />
          ) : null
        )}
      </CardContent>
    </Card>
  );
}
