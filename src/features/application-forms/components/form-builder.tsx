"use client";

import * as React from "react";
import { FormSchemaDefinition, FormFieldDefinition } from "../types";
import { saveOpeningFormVersionAction } from "@/features/openings/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ShieldAlert, Check, Layers } from "lucide-react";

let fieldIdCounter = 0;
function createUniqueFieldId(): string {
  fieldIdCounter += 1;
  return `field_${fieldIdCounter}_${Math.random().toString(36).substring(2, 7)}`;
}

interface FormBuilderProps {
  openingId: string;
  initialSchema: FormSchemaDefinition;
  currentVersionNumber: number;
  isOpeningPublished: boolean;
}

export function FormBuilder({
  openingId,
  initialSchema,
  currentVersionNumber,
  isOpeningPublished,
}: FormBuilderProps) {
  const [schema, setSchema] = React.useState<FormSchemaDefinition>(initialSchema);
  const [isSaving, setIsSaving] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const toggleFieldRequired = (sectionIndex: number, fieldIndex: number) => {
    setSchema((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as FormSchemaDefinition;
      updated.sections[sectionIndex].fields[fieldIndex].required =
        !updated.sections[sectionIndex].fields[fieldIndex].required;
      return updated;
    });
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    setSchema((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as FormSchemaDefinition;
      updated.sections[sectionIndex].fields.splice(fieldIndex, 1);
      return updated;
    });
  };

  const addCustomField = (sectionIndex: number) => {
    const newFieldId = createUniqueFieldId();
    const newField: FormFieldDefinition = {
      id: newFieldId,
      name: newFieldId,
      label: "New Form Question",
      type: "text",
      required: false,
      placeholder: "Candidate response...",
      order: schema.sections[sectionIndex].fields.length + 1,
    };

    setSchema((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as FormSchemaDefinition;
      updated.sections[sectionIndex].fields.push(newField);
      return updated;
    });
  };

  const handleSave = async (shouldPublish: boolean) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await saveOpeningFormVersionAction(openingId, schema, shouldPublish);
      if (res.success && res.data) {
        setStatusMessage({
          type: "success",
          text: `Form version ${res.data.versionNumber} ${shouldPublish ? "published successfully" : "saved as draft"}.`,
        });
      } else if (!res.success) {
        setStatusMessage({ type: "error", text: res.error.message });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Failed to save form version." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Versioning & Immutability Notice Banner */}
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3 text-xs leading-relaxed text-foreground">
        <ShieldAlert className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-foreground">Form Versioning & Historical Immutability Active</p>
          <p className="text-muted-foreground mt-0.5">
            Current Active Version: <span className="font-semibold text-foreground">v{currentVersionNumber}</span>.
            {isOpeningPublished
              ? " This opening is live. Saving modifications will automatically generate a new version number. Existing candidate applications remain permanently locked to their original submission form."
              : " While in DRAFT status, you can update this form in-place or publish it when the opening goes live."}
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 text-sm rounded-lg border ${
            statusMessage.type === "success"
              ? "bg-success/10 text-success border-success/20"
              : "bg-destructive/10 text-destructive border-destructive/20"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Sections & Fields */}
      <div className="space-y-6">
        {schema.sections.map((section, sIdx) => (
          <Card key={section.id} className="border-border/80">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  {section.title}
                </CardTitle>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => addCustomField(sIdx)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Field
              </Button>
            </CardHeader>

            <CardContent className="space-y-3">
              {section.fields.map((field, fIdx) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border/60 bg-card/60 text-sm"
                >
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-xs truncate">{field.label}</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {field.type}
                      </Badge>
                      {field.required ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Required
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Optional
                        </Badge>
                      )}
                    </div>
                    {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => toggleFieldRequired(sIdx, fIdx)}
                    >
                      {field.required ? "Make Optional" : "Make Required"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7 px-2"
                      onClick={() => removeField(sIdx, fIdx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save Action Bar */}
      <div className="flex items-center justify-between pt-4 border-t border-border/70">
        <span className="text-xs text-muted-foreground">
          Total Sections: {schema.sections.length} • Total Fields:{" "}
          {schema.sections.reduce((acc, s) => acc + s.fields.length, 0)}
        </span>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => handleSave(false)}
          >
            Save Draft Version
          </Button>
          <Button
            type="button"
            isLoading={isSaving}
            className="gap-2"
            onClick={() => handleSave(true)}
          >
            <Check className="h-4 w-4" />
            Publish Version
          </Button>
        </div>
      </div>
    </div>
  );
}
