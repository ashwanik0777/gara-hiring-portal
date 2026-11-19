"use client";

import * as React from "react";

/**
 * Field errors of the apply form (by field name), shared with fields rendered outside the
 * form builder, such as the applicant details, so each error shows beside its own field.
 */
export const ApplyFieldErrorsContext = React.createContext<Record<string, string>>({});

export function useApplyFieldError(name: string): string | undefined {
  return React.useContext(ApplyFieldErrorsContext)[name];
}
