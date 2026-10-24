"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { FormSchemaDefinition, FormFieldDefinition } from "../types";
import { submitApplicationAction } from "@/features/applications/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { UploadCloud, CheckCircle2, AlertCircle, FileText } from "lucide-react";

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Mirrors `getPrimaryFileField` on the server: the single document upload maps to the
 * field named `resume`, otherwise to the first file field of the form.
 */
function findPrimaryFileField(schema: FormSchemaDefinition): FormFieldDefinition | null {
  const fileFields = schema.sections.flatMap((section) =>
    section.fields.filter((field) => field.type === "file")
  );
  return fileFields.find((field) => field.name === "resume") ?? fileFields[0] ?? null;
}

interface DynamicFormRendererProps {
  formSchema: FormSchemaDefinition;
  openingTitle: string;
  openingSlug: string;
  candidateName?: string;
  candidateEmail?: string;
}

const INPUT_TYPES: Partial<Record<FormFieldDefinition["type"], string>> = {
  number: "number",
  email: "email",
  phone: "tel",
  date: "date",
};

export function DynamicFormRenderer({
  formSchema,
  openingTitle,
  openingSlug,
  candidateName = "",
  candidateEmail = "",
}: DynamicFormRendererProps) {
  const router = useRouter();
  const primaryFileField = findPrimaryFileField(formSchema);
  const fileErrorKey = primaryFileField?.name ?? "resume";

  // Prepopulate standard fields if present in schema
  const [formData, setFormData] = useState<Record<string, unknown>>({
    full_name: candidateName,
    email: candidateEmail,
  });

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submittedResult, setSubmittedResult] = useState<{
    referenceCode: string;
    applicationId: string;
  } | null>(null);

  const handleFieldChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== "application/pdf") {
        setFieldErrors((prev) => ({
          ...prev,
          [fileErrorKey]: "Only PDF format documents are supported.",
        }));
        return;
      }
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        setFieldErrors((prev) => ({
          ...prev,
          [fileErrorKey]: "Document size must not exceed 5MB.",
        }));
        return;
      }
      setResumeFile(file);
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[fileErrorKey];
        return copy;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    // The document upload is only mandatory when the published form marks it required.
    if (primaryFileField?.required && !resumeFile) {
      setFieldErrors({
        [fileErrorKey]: `${primaryFileField.label} is required. Please upload a PDF document.`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = new FormData();
      payload.append("openingSlug", openingSlug);
      payload.append("responses", JSON.stringify(formData));
      if (primaryFileField && resumeFile) {
        payload.append("resume", resumeFile);
      }

      const res = await submitApplicationAction(payload);

      if (!res.success) {
        setServerError(res.error);
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
        setIsSubmitting(false);
        return;
      }

      setSubmittedResult(res.data);
      setIsSubmitting(false);
    } catch {
      setServerError("An error occurred during submission. Please check your connection and try again.");
      setIsSubmitting(false);
    }
  };

  if (submittedResult) {
    return (
      <Card className="max-w-2xl mx-auto border-primary/30">
        <CardContent className="pt-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Application Submitted Successfully
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your application for <span className="font-semibold text-foreground">{openingTitle}</span> has been logged.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted border border-border inline-block text-left w-full max-w-md my-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
              Application Reference Code
            </div>
            <div className="text-lg font-mono font-bold text-primary mt-0.5">
              {submittedResult.referenceCode}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Save this reference number for your records. A confirmation email has also been queued.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              onClick={() => router.push(`/candidate/applications/${submittedResult.applicationId}`)}
            >
              View Application Details
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/candidate/dashboard")}
            >
              Go to Candidate Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl mx-auto">
      {serverError && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">Submission Error</div>
            <div className="text-xs mt-0.5">{serverError}</div>
          </div>
        </div>
      )}

      {formSchema.sections.map((section) => (
        <Card key={section.id} className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            {section.fields.map((field) => {
              const error = fieldErrors[field.name];

              if (field.type === "file" && field.id !== primaryFileField?.id) {
                // Only one document upload per application is supported.
                return (
                  <div key={field.id} className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{field.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Additional document uploads are not available for this form yet.
                    </p>
                  </div>
                );
              }

              if (field.type === "file") {
                return (
                  <div key={field.id} className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      {field.label}{" "}
                      {field.required && <span className="text-destructive">*</span>}
                    </label>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}

                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors bg-muted/20">
                      <input
                        type="file"
                        id={`file-${field.name}`}
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <label
                        htmlFor={`file-${field.name}`}
                        className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                      >
                        {resumeFile ? (
                          <div className="flex items-center gap-2 text-primary font-medium text-sm">
                            <FileText className="h-5 w-5" />
                            <span>{resumeFile.name} ({(resumeFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                          </div>
                        ) : (
                          <>
                            <UploadCloud className="h-8 w-8 text-muted-foreground" />
                            <div className="text-sm font-medium text-foreground">
                              Click to select a PDF document
                            </div>
                            <p className="text-xs text-muted-foreground">
                              PDF only, maximum size 5MB
                            </p>
                          </>
                        )}
                      </label>
                    </div>

                    {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                  </div>
                );
              }

              if (field.type === "textarea") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    <label htmlFor={field.name} className="block text-sm font-medium text-foreground">
                      {field.label}{" "}
                      {field.required && <span className="text-destructive">*</span>}
                    </label>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}
                    <textarea
                      id={field.name}
                      rows={4}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={(formData[field.name] as string) || ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.id} className="space-y-1.5">
                    <label htmlFor={field.name} className="block text-sm font-medium text-foreground">
                      {field.label}{" "}
                      {field.required && <span className="text-destructive">*</span>}
                    </label>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}
                    <select
                      id={field.name}
                      required={field.required}
                      value={(formData[field.name] as string) || ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Select an option...</option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                  </div>
                );
              }

              if (field.type === "multiselect" || field.type === "radio") {
                const isMulti = field.type === "multiselect";
                const currentValue = formData[field.name];
                const selectedValues = Array.isArray(currentValue)
                  ? currentValue.filter((v): v is string => typeof v === "string")
                  : [];
                return (
                  <fieldset key={field.id} className="space-y-2">
                    <legend className="block text-sm font-medium text-foreground">
                      {field.label}{" "}
                      {field.required && <span className="text-destructive">*</span>}
                    </legend>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}
                    <div className="space-y-1.5">
                      {field.options?.map((opt) => {
                        const optionId = `${field.name}-${opt.value}`;
                        const checked = isMulti
                          ? selectedValues.includes(opt.value)
                          : currentValue === opt.value;
                        return (
                          <div key={opt.value} className="flex items-center gap-2">
                            <input
                              type={isMulti ? "checkbox" : "radio"}
                              id={optionId}
                              name={field.name}
                              value={opt.value}
                              checked={checked}
                              onChange={(e) => {
                                if (!isMulti) {
                                  handleFieldChange(field.name, opt.value);
                                  return;
                                }
                                const next = e.target.checked
                                  ? [...selectedValues, opt.value]
                                  : selectedValues.filter((v) => v !== opt.value);
                                handleFieldChange(field.name, next);
                              }}
                              className="h-4 w-4 border-input text-primary focus:ring-ring"
                            />
                            <label htmlFor={optionId} className="text-sm text-foreground">
                              {opt.label}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                  </fieldset>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <div key={field.id} className="flex items-start gap-2 pt-2">
                    <input
                      type="checkbox"
                      id={field.name}
                      required={field.required}
                      checked={Boolean(formData[field.name])}
                      onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring mt-0.5"
                    />
                    <div>
                      <label htmlFor={field.name} className="text-sm font-medium text-foreground">
                        {field.label}{" "}
                        {field.required && <span className="text-destructive">*</span>}
                      </label>
                      {field.helpText && (
                        <p className="text-xs text-muted-foreground">{field.helpText}</p>
                      )}
                      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                    </div>
                  </div>
                );
              }

              return (
                <div key={field.id} className="space-y-1.5">
                  <Input
                    id={field.name}
                    label={field.label + (field.required ? " *" : "")}
                    type={INPUT_TYPES[field.type] ?? "text"}
                    placeholder={field.placeholder}
                    required={field.required}
                    error={error}
                    value={(formData[field.name] as string) || ""}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  />
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground -mt-1">{field.helpText}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card className="border-border">
        <CardFooter className="py-4 flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            Please ensure all attached documents and entries are accurate before submission.
          </p>
          <Button type="submit" size="lg" isLoading={isSubmitting}>
            Submit Application
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
