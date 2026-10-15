import { FormSchemaDefinition } from "./types";

/**
 * Returns a clean, baseline application form template for new openings.
 * All dynamic fields are fully configurable by admins per opening.
 */
export function getDefaultApplicationFormSchema(
  roleType: "INTERNSHIP" | "FULL_TIME" = "INTERNSHIP"
): FormSchemaDefinition {
  return {
    sections: [
      {
        id: "personal-info",
        title: "Personal Information",
        description: "Essential contact information for interview communications.",
        order: 1,
        fields: [
          {
            id: "full-name",
            name: "fullName",
            label: "Full Legal Name",
            type: "text",
            required: true,
            placeholder: "Jane Doe",
            order: 1,
          },
          {
            id: "email",
            name: "email",
            label: "Email Address",
            type: "email",
            required: true,
            placeholder: "jane@example.com",
            order: 2,
          },
          {
            id: "phone",
            name: "phone",
            label: "Phone Number",
            type: "phone",
            required: true,
            placeholder: "+91 98765 43210",
            order: 3,
          },
          {
            id: "current-city",
            name: "currentCity",
            label: "Current City / Location",
            type: "text",
            required: true,
            placeholder: "Bengaluru, India",
            order: 4,
          },
        ],
      },
      {
        id: "background-links",
        title: "Background & Profiles",
        description: "Share your professional background and academic credentials.",
        order: 2,
        fields: [
          {
            id: "education",
            name: "education",
            label: roleType === "INTERNSHIP" ? "College / Degree & Graduating Year" : "Highest Qualification",
            type: "text",
            required: true,
            placeholder: "B.Tech in Computer Science, 2026",
            order: 1,
          },
          {
            id: "linkedin",
            name: "linkedinUrl",
            label: "LinkedIn Profile URL",
            type: "text",
            required: false,
            placeholder: "https://linkedin.com/in/janedoe",
            order: 2,
          },
          {
            id: "github",
            name: "githubUrl",
            label: "GitHub / Portfolio URL",
            type: "text",
            required: false,
            placeholder: "https://github.com/janedoe",
            order: 3,
          },
        ],
      },
      {
        id: "documents-upload",
        title: "Resume & Documents",
        description: "Upload your resume in PDF format (maximum 5MB).",
        order: 3,
        fields: [
          {
            id: "resume-file",
            name: "resume",
            label: "Resume / CV (PDF)",
            type: "file",
            required: true,
            helpText: "Only PDF format is accepted. Max file size: 5MB.",
            validation: {
              allowedFileTypes: ["application/pdf"],
              maxFileSizeMb: 5,
            },
            order: 1,
          },
        ],
      },
      {
        id: "statement-availability",
        title: "Role Motivation & Availability",
        order: 4,
        fields: [
          {
            id: "motivation",
            name: "whyGara",
            label: "Why are you interested in joining GARA Innovation?",
            type: "textarea",
            required: false,
            placeholder: "Tell us what excites you about this role and our engineering domain...",
            validation: {
              max: 1000,
            },
            order: 1,
          },
          {
            id: "availability",
            name: "earliestStartDate",
            label: "Earliest Available Start Date",
            type: "date",
            required: true,
            order: 2,
          },
        ],
      },
    ],
  };
}
