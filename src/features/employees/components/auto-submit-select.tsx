"use client";

import React from "react";

/** A select inside a GET filter form that applies the filter as soon as it changes. */
export function AutoSubmitSelect(props: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange">) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
