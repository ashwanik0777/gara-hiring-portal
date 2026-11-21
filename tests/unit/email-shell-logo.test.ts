import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderEmailShell } from "@/infrastructure/email/email-templates";

// Emails show the logo at 42 px; they must link the small copy, not the 1 MB site logo.
describe("email logo", () => {
  it("links the small PNG logo that every mail app can show", () => {
    const html = renderEmailShell({ title: "T", salutation: "Hello,", leadParagraph: "Lead", contentHtml: "" });
    expect(html).toContain("/brand/gara-logo-email.png");
    expect(html).not.toContain("/brand/gara-logo.png");
    expect(html).not.toMatch(/\.webp/);
  });

  it("keeps the email logo file small", () => {
    const file = path.join(process.cwd(), "public/brand/gara-logo-email.png");
    expect(fs.statSync(file).size).toBeLessThan(20_000);
  });
});
