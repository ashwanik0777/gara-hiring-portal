import { FormSchemaDefinition, FormFieldDefinition, DocumentStorageMode } from "../types";
import { documentLinkSchema, DOCUMENT_LINK_INVALID_MESSAGE, DOCUMENT_LINK_REQUIRED_MESSAGE } from "../schemas";

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  sanitizedResponses: Record<string, unknown>;
  /**
   * Link mode only: the validated https share link given for the primary document field
   * (stored in `Application.resumeUrl`, never in the responses). Null otherwise.
   */
  documentLink: string | null;
}

export interface ValidateFormOptions {
  /**
   * "local" (default): document fields accept server-received uploads only.
   * "link": the primary document field takes an https share link from the responses.
   */
  documentMode?: DocumentStorageMode;
}

export interface FileMetadataInput {
  name: string;
  size: number;
  type: string;
  buffer?: Buffer | Uint8Array;
}

/** Default upload limits when a file field does not configure its own. */
export const DEFAULT_ALLOWED_FILE_TYPES = ["application/pdf"];
export const DEFAULT_MAX_FILE_SIZE_MB = 5;

/** Hard cap for any free-text answer, independent of admin-configured limits. */
export const MAX_TEXT_ANSWER_LENGTH = 5_000;

/**
 * Admin-configured regular expressions are only evaluated against inputs up to this
 * length, bounding the cost of pathological patterns.
 */
export const MAX_PATTERN_INPUT_LENGTH = 500;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const PHONE_ALLOWED_CHARS_REGEX = /^\+?[0-9\s().-]+$/;

function flattenFields(schema: FormSchemaDefinition): FormFieldDefinition[] {
  const allFields: FormFieldDefinition[] = [];
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      allFields.push(field);
    }
  }
  return allFields;
}

/**
 * Returns the file field that receives the single document upload supported by the
 * candidate form: the field named `resume` when present, otherwise the first file field.
 * Returns null when the form does not request any document.
 */
export function getPrimaryFileField(schema: FormSchemaDefinition): FormFieldDefinition | null {
  const fileFields = flattenFields(schema).filter((field) => field.type === "file");
  return fileFields.find((field) => field.name === "resume") ?? fileFields[0] ?? null;
}

function isValidCalendarDate(value: string): boolean {
  const match = DATE_REGEX.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidPhone(value: string): boolean {
  if (!PHONE_ALLOWED_CHARS_REGEX.test(value)) {
    return false;
  }
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= 6 && digitCount <= 15;
}

/**
 * Validates untrusted candidate responses against a published form definition.
 * Only fields defined in the form are kept; files are accepted exclusively from
 * server-received uploads (never from client-supplied JSON).
 */
export function validateFormResponses(
  schema: FormSchemaDefinition,
  responses: Record<string, unknown>,
  files?: Record<string, FileMetadataInput>,
  options: ValidateFormOptions = {}
): ValidationResult {
  const errors: Record<string, string> = {};
  const sanitizedResponses: Record<string, unknown> = {};
  let documentLink: string | null = null;
  const linkFieldId =
    options.documentMode === "link" ? getPrimaryFileField(schema)?.id ?? null : null;

  for (const field of flattenFields(schema)) {
    const rawValue = responses[field.name];

    // 1a. Link mode: the primary document field collects an https share link (no file).
    if (field.type === "file" && field.id === linkFieldId) {
      const isBlank =
        rawValue === undefined ||
        rawValue === null ||
        (typeof rawValue === "string" && rawValue.trim() === "");
      if (isBlank) {
        if (field.required) {
          errors[field.name] = DOCUMENT_LINK_REQUIRED_MESSAGE;
        }
        continue;
      }
      if (typeof rawValue !== "string") {
        errors[field.name] = DOCUMENT_LINK_INVALID_MESSAGE;
        continue;
      }
      const parsedLink = documentLinkSchema.safeParse(rawValue);
      if (!parsedLink.success) {
        errors[field.name] = parsedLink.error.issues[0]?.message ?? DOCUMENT_LINK_INVALID_MESSAGE;
        continue;
      }
      documentLink = parsedLink.data;
      continue;
    }

    // 1b. File fields: only real uploads count. Client JSON for a file field is ignored.
    if (field.type === "file") {
      const fileValue = files?.[field.name];
      if (!fileValue) {
        if (field.required) {
          errors[field.name] = `${field.label} is required`;
        }
        continue;
      }

      const maxMb = field.validation?.maxFileSizeMb ?? DEFAULT_MAX_FILE_SIZE_MB;
      const maxBytes = maxMb * 1024 * 1024;
      if (fileValue.size <= 0) {
        errors[field.name] = `${field.label} is empty`;
        continue;
      }
      if (fileValue.size > maxBytes) {
        errors[field.name] = `File size exceeds the ${maxMb}MB limit`;
        continue;
      }

      const configuredTypes = field.validation?.allowedFileTypes;
      const allowedTypes =
        configuredTypes && configuredTypes.length > 0 ? configuredTypes : DEFAULT_ALLOWED_FILE_TYPES;
      if (!allowedTypes.includes(fileValue.type)) {
        errors[field.name] = allowedTypes.every((type) => type === "application/pdf")
          ? "Invalid file type. Please upload a PDF document."
          : "Invalid file type. Please upload a supported document.";
        continue;
      }

      sanitizedResponses[field.name] = {
        name: fileValue.name,
        size: fileValue.size,
        type: fileValue.type,
      };
      continue;
    }

    // 2. Required check for standard fields
    const isEmpty =
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim() === "") ||
      (Array.isArray(rawValue) && rawValue.length === 0);

    if (isEmpty) {
      if (field.required) {
        errors[field.name] = `${field.label} is required`;
      }
      continue;
    }

    // 3. Type-specific checks
    if (field.type === "checkbox") {
      if (typeof rawValue !== "boolean") {
        errors[field.name] = `Invalid value for ${field.label}`;
        continue;
      }
      if (field.required && rawValue !== true) {
        errors[field.name] = `${field.label} must be checked`;
        continue;
      }
      sanitizedResponses[field.name] = rawValue;
      continue;
    }

    if (field.type === "multiselect") {
      if (!Array.isArray(rawValue) || !rawValue.every((item) => typeof item === "string")) {
        errors[field.name] = `Invalid selection for ${field.label}`;
        continue;
      }
      const selected = Array.from(new Set(rawValue.map((item: string) => item.trim()))).filter(
        (item) => item !== ""
      );
      if (selected.length === 0) {
        if (field.required) {
          errors[field.name] = `${field.label} is required`;
        }
        continue;
      }
      if (field.options && field.options.length > 0) {
        const validOptions = new Set(field.options.map((o) => o.value));
        if (!selected.every((item) => validOptions.has(item))) {
          errors[field.name] = `Invalid selection for ${field.label}`;
          continue;
        }
      }
      sanitizedResponses[field.name] = selected;
      continue;
    }

    if (field.type === "number") {
      if (typeof rawValue !== "number" && typeof rawValue !== "string") {
        errors[field.name] = "Please enter a valid number";
        continue;
      }
      const num = typeof rawValue === "number" ? rawValue : Number(rawValue.trim());
      if (!Number.isFinite(num)) {
        errors[field.name] = "Please enter a valid number";
        continue;
      }
      if (field.validation?.min !== undefined && num < field.validation.min) {
        errors[field.name] = `Minimum value is ${field.validation.min}`;
        continue;
      }
      if (field.validation?.max !== undefined && num > field.validation.max) {
        errors[field.name] = `Maximum value is ${field.validation.max}`;
        continue;
      }
      sanitizedResponses[field.name] = num;
      continue;
    }

    // All remaining field types carry a single string value.
    if (typeof rawValue !== "string") {
      errors[field.name] = `Invalid value for ${field.label}`;
      continue;
    }
    const strVal = rawValue.trim();

    if (strVal.length > MAX_TEXT_ANSWER_LENGTH) {
      errors[field.name] = `${field.label} must be at most ${MAX_TEXT_ANSWER_LENGTH} characters`;
      continue;
    }

    if (field.type === "email") {
      if (strVal.length > 254 || !EMAIL_REGEX.test(strVal)) {
        errors[field.name] = "Please enter a valid email address";
        continue;
      }
      sanitizedResponses[field.name] = strVal.toLowerCase();
      continue;
    }

    if (field.type === "select" || field.type === "radio") {
      if (field.options && field.options.length > 0) {
        const validOptions = field.options.map((o) => o.value);
        if (!validOptions.includes(strVal)) {
          errors[field.name] = `Invalid selection for ${field.label}`;
          continue;
        }
      }
      sanitizedResponses[field.name] = strVal;
      continue;
    }

    if (field.type === "date" && !isValidCalendarDate(strVal)) {
      errors[field.name] = `${field.label} must be a valid date (YYYY-MM-DD)`;
      continue;
    }

    if (field.type === "phone" && !isValidPhone(strVal)) {
      errors[field.name] = `Please enter a valid phone number for ${field.label}`;
      continue;
    }

    // text, textarea, phone, date: admin-configured length and pattern rules
    if (field.validation?.min !== undefined && strVal.length < field.validation.min) {
      errors[field.name] = `${field.label} must be at least ${field.validation.min} characters`;
      continue;
    }
    if (field.validation?.max !== undefined && strVal.length > field.validation.max) {
      errors[field.name] = `${field.label} must be at most ${field.validation.max} characters`;
      continue;
    }
    if (field.validation?.pattern) {
      if (strVal.length > MAX_PATTERN_INPUT_LENGTH) {
        errors[field.name] = `${field.label} must be at most ${MAX_PATTERN_INPUT_LENGTH} characters`;
        continue;
      }
      let regex: RegExp | null = null;
      try {
        regex = new RegExp(field.validation.pattern);
      } catch {
        // Invalid patterns are rejected when the form is saved; ignore legacy ones here.
        regex = null;
      }
      if (regex && !regex.test(strVal)) {
        errors[field.name] = `${field.label} format is invalid`;
        continue;
      }
    }
    sanitizedResponses[field.name] = strVal;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedResponses,
    documentLink,
  };
}
