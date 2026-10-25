import { z } from "zod";

/** Longest admin-configured regex pattern accepted for a field. */
export const MAX_FIELD_PATTERN_LENGTH = 200;

export const formFieldOptionSchema = z.object({
  label: z.string().min(1, "Option label is required").max(200),
  value: z.string().min(1, "Option value is required").max(200),
});

export const formFieldValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z
    .string()
    .max(MAX_FIELD_PATTERN_LENGTH, `Validation pattern cannot exceed ${MAX_FIELD_PATTERN_LENGTH} characters`)
    .refine(
      (pattern) => {
        try {
          new RegExp(pattern);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Validation pattern is not a valid regular expression" }
    )
    .optional(),
  allowedFileTypes: z.array(z.string().max(100)).max(10).optional(),
  maxFileSizeMb: z.number().positive().max(50).optional(),
});

export const formFieldDefinitionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z
    .string()
    .min(1, "Field name is required")
    .max(100, "Field name cannot exceed 100 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Field name must be alphanumeric with underscores only"),
  label: z.string().min(1, "Field label is required").max(500),
  type: z.enum([
    "text",
    "textarea",
    "email",
    "phone",
    "number",
    "select",
    "multiselect",
    "radio",
    "checkbox",
    "file",
    "date",
  ]),
  required: z.boolean().default(false),
  placeholder: z.string().max(300).optional(),
  helpText: z.string().max(1000).optional(),
  options: z.array(formFieldOptionSchema).max(100).optional(),
  validation: formFieldValidationSchema.optional(),
  order: z.number().int().min(0),
});

export const formSectionDefinitionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1, "Section title is required").max(200),
  description: z.string().max(1000).optional(),
  order: z.number().int().min(0),
  fields: z.array(formFieldDefinitionSchema).max(100),
});

export const formSchemaDefinitionSchema = z
  .object({
    sections: z
      .array(formSectionDefinitionSchema)
      .min(1, "At least one section is required")
      .max(50),
  })
  .superRefine((schema, ctx) => {
    // Responses are keyed by field name, so names must be unique across the whole form.
    const seen = new Set<string>();
    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (seen.has(field.name)) {
          ctx.addIssue({
            code: "custom",
            message: `Field name "${field.name}" is used more than once. Field names must be unique.`,
            path: ["sections"],
          });
          return;
        }
        seen.add(field.name);
      }
    }
  });

export type FormSchemaDefinitionInput = z.infer<typeof formSchemaDefinitionSchema>;

/** Hard upper bounds for untrusted candidate responses (before per-field validation). */
export const MAX_RESPONSE_FIELDS = 200;
export const MAX_RESPONSE_STRING_LENGTH = 10_000;
export const MAX_RESPONSE_ARRAY_ITEMS = 100;

const formResponseValueSchema = z.union([
  z.string().max(MAX_RESPONSE_STRING_LENGTH),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(1_000)).max(MAX_RESPONSE_ARRAY_ITEMS),
]);

/**
 * Shape check for the raw `responses` payload submitted by a candidate: a flat record
 * of primitive values or string arrays. Per-field rules are applied afterwards by
 * `validateFormResponses` against the published form definition.
 */
export const formResponsesPayloadSchema = z
  .record(z.string().max(100), formResponseValueSchema)
  .refine((responses) => Object.keys(responses).length <= MAX_RESPONSE_FIELDS, {
    message: "Too many response fields submitted",
  });

export type FormResponsesPayload = z.infer<typeof formResponsesPayloadSchema>;

/** Longest accepted document share link (also the limit after URL normalisation). */
export const MAX_DOCUMENT_LINK_LENGTH = 2048;

export const DOCUMENT_LINK_REQUIRED_MESSAGE = "Please paste the link to your resume.";
export const DOCUMENT_LINK_INVALID_MESSAGE = "Please paste a valid https link to your resume.";
export const DOCUMENT_LINK_TOO_LONG_MESSAGE =
  "This link is too long. Please paste the share link from Google Drive, OneDrive or Dropbox.";

/**
 * True for an absolute https URL with a real host name and no embedded credentials.
 * Rejects http:, javascript:, data: and every other scheme, and relative paths.
 */
export function isSafeHttpsUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname.includes(".") &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

/**
 * Candidate-provided document share link (DOCUMENT_STORAGE_MODE "link"). Trimmed, https only,
 * at most MAX_DOCUMENT_LINK_LENGTH characters; the stored value is the normalised URL.
 */
export const documentLinkSchema = z
  .string()
  .trim()
  .min(1, DOCUMENT_LINK_REQUIRED_MESSAGE)
  .max(MAX_DOCUMENT_LINK_LENGTH, DOCUMENT_LINK_TOO_LONG_MESSAGE)
  .refine(isSafeHttpsUrl, DOCUMENT_LINK_INVALID_MESSAGE)
  .transform((value) => new URL(value).href)
  .refine((href) => href.length <= MAX_DOCUMENT_LINK_LENGTH, DOCUMENT_LINK_TOO_LONG_MESSAGE);
