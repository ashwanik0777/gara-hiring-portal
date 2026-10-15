import { z } from "zod";

export const formFieldOptionSchema = z.object({
  label: z.string().min(1, "Option label is required"),
  value: z.string().min(1, "Option value is required"),
});

export const formFieldValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  maxFileSizeMb: z.number().positive().max(50).optional(),
});

export const formFieldDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(1, "Field name is required")
    .regex(/^[a-zA-Z0-9_]+$/, "Field name must be alphanumeric with underscores only"),
  label: z.string().min(1, "Field label is required"),
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
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(formFieldOptionSchema).optional(),
  validation: formFieldValidationSchema.optional(),
  order: z.number().int().min(0),
});

export const formSectionDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Section title is required"),
  description: z.string().optional(),
  order: z.number().int().min(0),
  fields: z.array(formFieldDefinitionSchema),
});

export const formSchemaDefinitionSchema = z.object({
  sections: z.array(formSectionDefinitionSchema).min(1, "At least one section is required"),
});

export type FormSchemaDefinitionInput = z.infer<typeof formSchemaDefinitionSchema>;
