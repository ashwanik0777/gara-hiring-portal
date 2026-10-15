import { FormSchemaDefinition, FormFieldDefinition } from "../types";

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  sanitizedResponses: Record<string, unknown>;
}

export interface FileMetadataInput {
  name: string;
  size: number;
  type: string;
  buffer?: Buffer | Uint8Array;
}

export function validateFormResponses(
  schema: FormSchemaDefinition,
  responses: Record<string, unknown>,
  files?: Record<string, FileMetadataInput>
): ValidationResult {
  const errors: Record<string, string> = {};
  const sanitizedResponses: Record<string, unknown> = {};

  // Flatten all fields across sections
  const allFields: FormFieldDefinition[] = [];
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      allFields.push(field);
    }
  }

  for (const field of allFields) {
    const rawValue = responses[field.name];
    const fileValue = files?.[field.name];

    // 1. File field validation
    if (field.type === "file") {
      if (field.required && !fileValue && !rawValue) {
        errors[field.name] = `${field.label} is required`;
        continue;
      }

      if (fileValue) {
        const maxMb = field.validation?.maxFileSizeMb ?? 5;
        const maxBytes = maxMb * 1024 * 1024;
        if (fileValue.size > maxBytes) {
          errors[field.name] = `File size exceeds the ${maxMb}MB limit`;
          continue;
        }

        const allowedTypes = field.validation?.allowedFileTypes ?? ["application/pdf"];
        if (allowedTypes.length > 0 && !allowedTypes.includes(fileValue.type)) {
          errors[field.name] = `Invalid file type. Allowed: ${allowedTypes.join(", ")}`;
          continue;
        }

        sanitizedResponses[field.name] = {
          name: fileValue.name,
          size: fileValue.size,
          type: fileValue.type,
        };
      } else if (rawValue) {
        sanitizedResponses[field.name] = rawValue;
      }
      continue;
    }

    // 2. Required check for standard fields
    const isEmpty =
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim() === "") ||
      (Array.isArray(rawValue) && rawValue.length === 0);

    if (field.required && isEmpty) {
      errors[field.name] = `${field.label} is required`;
      continue;
    }

    if (isEmpty) {
      // Optional field left empty
      continue;
    }

    // 3. Type-specific checks
    if (field.type === "email") {
      const emailStr = String(rawValue).trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailStr)) {
        errors[field.name] = "Please enter a valid email address";
        continue;
      }
      sanitizedResponses[field.name] = emailStr.toLowerCase();
    } else if (field.type === "number") {
      const num = Number(rawValue);
      if (isNaN(num)) {
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
    } else if (field.type === "select" || field.type === "radio") {
      const strVal = String(rawValue);
      if (field.options && field.options.length > 0) {
        const validOptions = field.options.map((o) => o.value);
        if (!validOptions.includes(strVal)) {
          errors[field.name] = `Invalid selection for ${field.label}`;
          continue;
        }
      }
      sanitizedResponses[field.name] = strVal;
    } else if (field.type === "checkbox") {
      sanitizedResponses[field.name] = Boolean(rawValue);
    } else {
      // text, textarea, phone, date
      const strVal = String(rawValue).trim();
      if (field.validation?.pattern) {
        try {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(strVal)) {
            errors[field.name] = `${field.label} format is invalid`;
            continue;
          }
        } catch {
          // Ignore invalid regex in config
        }
      }
      if (field.validation?.min !== undefined && strVal.length < field.validation.min) {
        errors[field.name] = `${field.label} must be at least ${field.validation.min} characters`;
        continue;
      }
      if (field.validation?.max !== undefined && strVal.length > field.validation.max) {
        errors[field.name] = `${field.label} must be at most ${field.validation.max} characters`;
        continue;
      }
      sanitizedResponses[field.name] = strVal;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedResponses,
  };
}
