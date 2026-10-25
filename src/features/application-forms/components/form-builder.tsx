import { env } from "@/lib/env";
import { FormBuilderClient, type FormBuilderClientProps } from "./form-builder-client";

export type FormBuilderProps = Omit<FormBuilderClientProps, "documentMode">;

/**
 * Server entry point of the opening form builder: passes the deployment's document mode
 * (`DOCUMENT_STORAGE_MODE`) so document fields are labelled as links or uploads.
 */
export function FormBuilder(props: FormBuilderProps) {
  return <FormBuilderClient {...props} documentMode={env.DOCUMENT_STORAGE_MODE} />;
}
