export type FormFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "file"
  | "date";

/**
 * How candidates provide the application document (mirrors `env.DOCUMENT_STORAGE_MODE`).
 * "link": an external https share link (Google Drive, OneDrive, Dropbox); no file is stored.
 * "local": a PDF upload kept in the server's private storage.
 */
export type DocumentStorageMode = "link" | "local";

export interface FormFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  allowedFileTypes?: string[]; // e.g. ["application/pdf", "image/png"]
  maxFileSizeMb?: number; // e.g. 5
}

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
  order: number;
}

export interface FormSectionDefinition {
  id: string;
  title: string;
  description?: string;
  order: number;
  fields: FormFieldDefinition[];
}

export interface FormSchemaDefinition {
  sections: FormSectionDefinition[];
}

export interface FormVersionSummary {
  id: string;
  openingId: string;
  versionNumber: number;
  isPublished: boolean;
  createdAt: Date;
  schemaDefinition: FormSchemaDefinition;
}
