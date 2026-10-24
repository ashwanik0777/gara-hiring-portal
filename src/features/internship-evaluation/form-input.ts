import { z } from "zod";
import { ValidationError } from "@/lib/errors";

/**
 * Reads the given keys from a Server Action FormData payload. Only string values are kept,
 * so File entries or unexpected argument types never reach the schemas as strings.
 */
export function readFormFields(
  formData: unknown,
  keys: readonly string[]
): Record<string, string | undefined> {
  // Duck-typed so FormData instances from another realm/implementation are accepted.
  if (
    typeof formData !== "object" ||
    formData === null ||
    typeof (formData as { get?: unknown }).get !== "function"
  ) {
    throw new ValidationError("Invalid request payload.");
  }
  const form = formData as Pick<FormData, "get">;
  const values: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = form.get(key);
    values[key] = typeof value === "string" ? value : undefined;
  }
  return values;
}

/** Validates untrusted input and throws a ValidationError with the first issue's message. */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(first?.message ?? "Invalid input data", result.error.issues);
  }
  return result.data;
}
