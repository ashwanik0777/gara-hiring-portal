import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, state, requestHeaders } = vi.hoisted(() => {
  const state = {
    session: null as null | { user: { id: string; email: string; name: string } },
    users: {} as Record<string, { roles: string[] }>,
  };
  const requestHeaders = { value: new Headers() };
  const db = {
    user: { findUnique: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    application: { updateMany: vi.fn() },
    applicationStatusHistory: { create: vi.fn() },
    jobOffer: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    notificationOutbox: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, state, requestHeaders };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders.value) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}));
vi.mock("@/infrastructure/email/outbox-dispatch", () => ({ scheduleOutboxFlush: vi.fn() }));

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { ApplicationStatus, OfferStatus, Role } from "@prisma/client";
import { buildOfferLetterPdf, sha256Hex } from "@/infrastructure/pdf/offer-letter-pdf-generator";
import { escapePdfLiteral, measureWinAnsi, toWinAnsi, wrapText } from "@/infrastructure/pdf/pdf-text";
import type { OfferLetterPdfPayload } from "@/infrastructure/pdf/types";
import {
  offerLetterHash,
  renderOfferLetter,
  SIGNATURE_USER_AGENT_MAX_LENGTH,
} from "@/features/employees/services/offer-letter";
import { offerService } from "@/features/employees/services/offer-service";
import { candidateDecideOfferAction } from "@/features/employees/actions";
import { signatureNamesMatch } from "@/features/employees/offer-esign";
import { GET as downloadLetter } from "@/app/api/offers/[id]/letter/route";
import { CandidateOfferView } from "@/features/employees/components/candidate-offer-view";
import { ReadOnlyOfferSummary } from "@/features/lifecycle/components/read-only-offer-summary";
import { getClientIpHash } from "@/lib/security/client-ip";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import {
  buildOfferAcceptedConfirmationEmail,
  OFFER_ACCEPTED_CONFIRMATION_TEMPLATE,
  renderOfferAcceptedConfirmationEmail,
} from "@/infrastructure/email/templates/offer-letter-emails";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const HR_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";
const MANAGER_ID = "55555555-5555-4555-8555-555555555555";
const INTERVIEWER_ID = "66666666-6666-4666-8666-666666666666";
const APP_ID = "77777777-7777-4777-8777-777777777777";
const OFFER_ID = "88888888-8888-4888-8888-888888888888";

const TZ = "Asia/Kolkata";

const basePayload: OfferLetterPdfPayload = {
  offerReference: "GARA-APP-42",
  issuedAt: new Date("2026-10-20T10:30:00.000Z"),
  candidateName: "Candidate Tester",
  designation: "Platform Engineer",
  department: "Engineering",
  location: "Pune",
  expectedJoiningDate: new Date("2026-12-01T00:00:00.000Z"),
  termsSummary: "Terms agreed with the candidate during the final discussion.",
  extendedByName: "Priya HR",
  timeZone: TZ,
};

function pdfText(pdf: Buffer): string {
  return pdf.toString("latin1");
}

/** Checks that every xref entry points at its object and startxref points at the table. */
function expectValidXref(pdf: Buffer): void {
  const text = pdfText(pdf);
  const startXref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
  expect(text.slice(startXref, startXref + 4)).toBe("xref");
  const table = text.slice(startXref).split("\n");
  const count = Number(table[1].split(" ")[1]);
  for (let objectNumber = 1; objectNumber < count; objectNumber++) {
    const offset = Number(table[2 + objectNumber].slice(0, 10));
    expect(text.slice(offset, offset + `${objectNumber} 0 obj`.length)).toBe(`${objectNumber} 0 obj`);
  }
}

function offerRow(
  status: OfferStatus,
  overrides: Record<string, unknown> = {},
  applicationStatus: ApplicationStatus = status === OfferStatus.ACCEPTED
    ? ApplicationStatus.OFFER_ACCEPTED
    : ApplicationStatus.OFFERED
) {
  return {
    id: OFFER_ID,
    applicationId: APP_ID,
    status,
    expectedJoiningDate: new Date("2026-12-01T00:00:00.000Z"),
    department: "Engineering",
    designation: "Platform Engineer",
    location: "Pune",
    termsSummary: "Terms agreed with the candidate during the final discussion.",
    extendedById: HR_ID,
    extendedAt: status === OfferStatus.DRAFT ? null : new Date("2026-10-20T10:30:00.000Z"),
    decisionAt: null,
    declineReason: null,
    signedName: null,
    signedAt: null,
    signatureIpHash: null,
    signatureUserAgent: null,
    signedDocumentHash: null,
    notes: "Confidential staff notes",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    extendedBy: { id: HR_ID, name: "Priya HR", email: "hr@gara.test" },
    application: {
      id: APP_ID,
      referenceCode: "GARA-APP-42",
      status: applicationStatus,
      isArchived: false,
      candidate: {
        id: "cand-profile",
        userId: CANDIDATE_ID,
        user: {
          id: CANDIDATE_ID,
          name: "Candidate Tester",
          email: "cand@gara.test",
          employeeProfile: null,
        },
      },
      opening: { title: "Platform Engineer" },
    },
    ...overrides,
  };
}

/** An accepted offer with signature evidence recorded against the issued letter. */
function signedRow() {
  const issued = offerRow(OfferStatus.EXTENDED);
  return offerRow(OfferStatus.ACCEPTED, {
    decisionAt: new Date("2026-10-22T09:05:00.000Z"),
    signedName: "Candidate Tester",
    signedAt: new Date("2026-10-22T09:05:00.000Z"),
    signatureIpHash: "a".repeat(64),
    signatureUserAgent: "Mozilla/5.0",
    signedDocumentHash: offerLetterHash(issued),
  });
}

function signInAs(userId: string, roles: Role[]) {
  state.session = { user: { id: userId, email: `${userId}@gara.test`, name: "Tester" } };
  state.users[userId] = { roles };
}

function asUser(id: string, roles: Role[], name = "Tester"): AuthenticatedUser {
  return { id, name, email: `${id}@gara.test`, roles };
}

function denyEmployeesPermission(userId: string) {
  db.subAdminPermission.findUnique.mockResolvedValue({
    id: "perm",
    userId,
    canApplications: true,
    canOpenings: true,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: false,
    canAttendance: true,
    canLeave: true,
    canPayroll: false,
    canReports: true,
  });
}

function acceptForm(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.append("offerId", OFFER_ID);
  formData.append("decision", "ACCEPT");
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return formData;
}

async function download(id = OFFER_ID) {
  return downloadLetter(new NextRequest(`http://localhost/api/offers/${id}/letter`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  state.session = null;
  state.users = {};
  requestHeaders.value = new Headers();
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
  db.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const entry = state.users[args.where.id];
    return entry ? { id: args.where.id, mustChangePassword: false, roles: entry.roles.map((role) => ({ role })) } : null;
  });
  db.subAdminPermission.findUnique.mockResolvedValue(null);
  db.application.updateMany.mockResolvedValue({ count: 1 });
  db.jobOffer.updateMany.mockResolvedValue({ count: 1 });
});

describe("Offer letter PDF generator", () => {
  it("produces byte-identical output, and therefore the same SHA-256, for the same inputs", () => {
    const first = buildOfferLetterPdf(basePayload);
    const second = buildOfferLetterPdf({ ...basePayload });
    expect(first.equals(second)).toBe(true);
    expect(sha256Hex(first)).toBe(sha256Hex(second));
    expect(sha256Hex(first)).toMatch(/^[0-9a-f]{64}$/);

    const changed = buildOfferLetterPdf({ ...basePayload, termsSummary: `${basePayload.termsSummary}!` });
    expect(sha256Hex(changed)).not.toBe(sha256Hex(first));
  });

  it("is a structurally valid PDF with correct cross-reference offsets", () => {
    const pdf = buildOfferLetterPdf(basePayload);
    const text = pdfText(pdf);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
    expect(text).toContain("/Encoding /WinAnsiEncoding");
    expectValidXref(pdf);
  });

  it("contains only offer data and neutral fixed wording (OD-020)", () => {
    const text = pdfText(buildOfferLetterPdf(basePayload));
    expect(text).toContain("(This letter confirms the offer described below.) Tj");
    for (const value of ["Candidate Tester", "Platform Engineer", "Engineering", "Pune", "GARA-APP-42", "Extended by Priya HR"]) {
      expect(text).toContain(value);
    }
    expect(text).toContain("(1 December 2026) Tj");
    expect(text).toContain("Issue date: 20 October 2026");
    expect(text).not.toMatch(/salary|probation|legally binding|compensation/i);
  });

  it("omits the location row when no location was set", () => {
    const text = pdfText(buildOfferLetterPdf({ ...basePayload, location: null }));
    expect(text).not.toContain("(Location) Tj");
  });

  it("escapes PDF string delimiters so text cannot inject operators", () => {
    const text = pdfText(
      buildOfferLetterPdf({ ...basePayload, candidateName: "Name) Tj (injected \\ back" })
    );
    expect(text).toContain("(Name\\) Tj \\(injected \\\\ back) Tj");
    expect(text).not.toContain("(Name) Tj (injected");
  });

  it("transliterates or replaces characters the standard fonts cannot show", () => {
    expect(toWinAnsi("José")).toBe("José");
    expect(escapePdfLiteral(toWinAnsi("José"))).toBe("Jos\\351");
    expect(toWinAnsi("₹50,000 – “ok”")).toBe("Rs.50,000 \u0096 \u0093ok\u0094");
    // "á" exists in WinAnsi; "ř" is reduced to its base letter; "Ł" has no decomposition.
    expect(toWinAnsi("Łukasz Dvořák")).toBe("?ukasz Dvor\u00e1k");
    expect(toWinAnsi("अश्विनी")).toBe("????");
    expect(toWinAnsi("Hi 😀\u0007​!")).toBe("Hi ?!");

    const pdf = buildOfferLetterPdf({
      ...basePayload,
      candidateName: "José अश्विनी 😀",
      termsSummary: "Bonus ₹1,00,000\r\nTabs\tand spaces",
    });
    // Everything after the binary marker line is ASCII: no raw UTF-8 reaches the file.
    const body = pdf.subarray(pdf.indexOf(0x0a, 9) + 1);
    expect(body.every((byte) => byte < 0x80)).toBe(true);
    expect(pdfText(pdf)).toContain("(Jos\\351 ???? ?) Tj");
    expect(pdfText(pdf)).toContain("(Bonus Rs.1,00,000) Tj");
    expectValidXref(pdf);
  });

  it("wraps long text within the margins and breaks words longer than a line", () => {
    const lines = wrapText(`${"word ".repeat(200)}\n${"x".repeat(400)}`, "regular", 10.5, 467);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      expect(measureWinAnsi(line, "regular", 10.5)).toBeLessThanOrEqual(467);
    }
    expect(wrapText("one\n\ntwo", "regular", 10, 400)).toEqual(["one", "", "two"]);
  });

  it("flows long terms onto further pages with a page-numbered footer", () => {
    const pdf = buildOfferLetterPdf({
      ...basePayload,
      termsSummary: ("Line of agreed terms that is repeated to fill the page. ".repeat(8) + "\n").repeat(12).slice(0, 5000),
    });
    const text = pdfText(pdf);
    expect(text).toContain("/Count 2");
    expect(text).toContain("Page 1 of 2");
    expect(text).toContain("Page 2 of 2");
    expectValidXref(pdf);
  });

  it("adds the electronic acceptance block only to an accepted letter", () => {
    const hash = "0123456789abcdef".repeat(4);
    const open = pdfText(buildOfferLetterPdf(basePayload));
    expect(open).not.toContain("Accepted electronically");

    const accepted = pdfText(
      buildOfferLetterPdf({
        ...basePayload,
        acceptance: { signedName: "Candidate Tester", signedAt: new Date("2026-10-22T09:05:00.000Z"), documentHash: hash },
      })
    );
    // The line wraps inside the box; the time is shown in the business time zone with its offset.
    expect(accepted).toContain("(Accepted electronically by Candidate Tester on 22 October 2026, 14:35 UTC+05:30 \\267 Document");
    expect(accepted).toContain("hash 0123456789abcdef) Tj");
    expect(accepted).not.toContain(hash);
  });
});

describe("Offer letter variants", () => {
  it("hashes the letter as issued, so the hash stays reproducible after acceptance", () => {
    const issued = offerRow(OfferStatus.EXTENDED);
    const accepted = signedRow();
    expect(offerLetterHash(accepted)).toBe(offerLetterHash(issued));
    expect(accepted.signedDocumentHash).toBe(sha256Hex(renderOfferLetter(issued, "AS_ISSUED")));
  });

  it("shows neutral status lines on letters that are no longer open", () => {
    const declined = pdfText(
      renderOfferLetter(offerRow(OfferStatus.DECLINED, { decisionAt: new Date("2026-10-22T09:05:00.000Z") }), "CURRENT", TZ)
    );
    expect(declined).toContain("This offer was declined on 22 October 2026.");
    expect(pdfText(renderOfferLetter(offerRow(OfferStatus.DRAFT), "CURRENT"))).toContain(
      "Draft. This offer has not been extended to the candidate."
    );
    expect(pdfText(renderOfferLetter(signedRow(), "CURRENT"))).toContain("Accepted electronically by Candidate Tester");
  });
});

describe("GET /api/offers/[id]/letter authorization", () => {
  it("requires a signed-in user", async () => {
    const res = await download();
    expect(res.status).toBe(401);
    expect(db.jobOffer.findUnique).not.toHaveBeenCalled();
  });

  it("serves the owning candidate's extended offer as a no-store attachment", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.EXTENDED));

    const res = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="GARA_Offer_Letter_GARA-APP-42.pdf"');
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  });

  it("serves the signed letter after acceptance, also after joining", async () => {
    signInAs(CANDIDATE_ID, [Role.EMPLOYEE]);
    db.jobOffer.findUnique.mockResolvedValue(signedRow());

    const res = await download();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1")).toContain("Accepted electronically by Candidate Tester");
  });

  it("serves the declined letter to its owner", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.DECLINED));
    expect((await download()).status).toBe(200);
  });

  it.each([OfferStatus.DRAFT, OfferStatus.REVOKED, OfferStatus.EXPIRED])(
    "never serves a %s offer to the candidate",
    async (status) => {
      signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
      db.jobOffer.findUnique.mockResolvedValue(offerRow(status, {}, ApplicationStatus.INTERVIEWED));
      const res = await download();
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toContain("application/json");
    }
  );

  it("refuses another candidate", async () => {
    signInAs(OTHER_CANDIDATE_ID, [Role.CANDIDATE]);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.EXTENDED));
    const res = await download();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You are not authorized to download this offer letter.", code: "FORBIDDEN" });
  });

  it("lets HR with canEmployees download any offer, including a draft preview", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.DRAFT, {}, ApplicationStatus.INTERVIEWED));
    const res = await download();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1")).toContain("Draft. This offer has not been extended");
  });

  it("lets ADMIN download a revoked offer", async () => {
    signInAs(ADMIN_ID, [Role.ADMIN]);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.REVOKED, {}, ApplicationStatus.INTERVIEWED));
    expect((await download()).status).toBe(200);
  });

  it("refuses HR without canEmployees", async () => {
    signInAs(HR_ID, [Role.HR]);
    denyEmployeesPermission(HR_ID);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.EXTENDED));
    expect((await download()).status).toBe(403);
  });

  it.each([
    [MANAGER_ID, Role.MANAGER],
    [INTERVIEWER_ID, Role.INTERVIEWER],
  ])("refuses %s staff outside the offer-management roles", async (id, role) => {
    signInAs(id, [role]);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.EXTENDED));
    expect((await download()).status).toBe(403);
  });

  it("returns 404 for unknown or malformed offer ids", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.jobOffer.findUnique.mockResolvedValue(null);
    expect((await download()).status).toBe(404);
    expect((await download("not-a-uuid")).status).toBe(404);
    expect(db.jobOffer.findUnique).toHaveBeenCalledTimes(1);
  });

  it("hides unexpected failures behind a friendly message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    signInAs(HR_ID, [Role.HR]);
    db.jobOffer.findUnique.mockRejectedValue(new Error("connection refused at 10.0.0.5"));
    const res = await download();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("We couldn't prepare the offer letter right now. Please try again later.");
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
    consoleError.mockRestore();
  });
});

describe("Electronic acceptance (Server Action)", () => {
  const userAgent = `Mozilla/5.0 ${"x".repeat(500)}`;

  function primeAccept(row = offerRow(OfferStatus.EXTENDED)) {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    requestHeaders.value = new Headers({ "x-real-ip": "203.0.113.7", "user-agent": userAgent });
    db.jobOffer.findUnique.mockResolvedValue(row);
    return offerLetterHash(row);
  }

  it("matches the typed name case- and whitespace-insensitively", () => {
    expect(signatureNamesMatch("  candidate   TESTER ", "Candidate Tester")).toBe(true);
    expect(signatureNamesMatch("Candidate Test", "Candidate Tester")).toBe(false);
    expect(signatureNamesMatch("", "")).toBe(false);
  });

  it("stores the signature evidence in the same conditional update that accepts the offer", async () => {
    const letterHash = primeAccept();

    const res = await candidateDecideOfferAction(
      acceptForm({ signedName: "  candidate   TESTER ", consent: "true", letterHash })
    );
    expect(res).toEqual({ success: true, data: { decision: "ACCEPT" } });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.jobOffer.update).not.toHaveBeenCalled();
    expect(db.jobOffer.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = db.jobOffer.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: OFFER_ID, status: OfferStatus.EXTENDED });
    expect(data).toMatchObject({
      status: OfferStatus.ACCEPTED,
      signedName: "candidate TESTER",
      signatureIpHash: getClientIpHash(new Headers({ "x-real-ip": "203.0.113.7" }), "offer-esign"),
      signedDocumentHash: letterHash,
    });
    expect(data.signatureIpHash).not.toContain("203.0.113.7");
    expect(data.signatureUserAgent).toHaveLength(SIGNATURE_USER_AGENT_MAX_LENGTH);
    expect(data.signedAt).toBeInstanceOf(Date);
    expect(data.decisionAt).toBe(data.signedAt);

    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: ApplicationStatus.OFFERED },
      data: { status: ApplicationStatus.OFFER_ACCEPTED },
    });
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ACCEPT_JOB_OFFER",
          diffPayload: expect.objectContaining({ signedDocumentHash: letterHash, signatureMethod: "TYPED_NAME" }),
        }),
      })
    );
    expect(db.notificationOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientEmail: "cand@gara.test",
        templateName: OFFER_ACCEPTED_CONFIRMATION_TEMPLATE,
        payload: expect.objectContaining({
          documentHashPrefix: letterHash.slice(0, 16),
          portalPath: `/candidate/applications/${APP_ID}`,
        }),
      }),
    });
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });

  it("fails the whole transaction when the application stage moved concurrently", async () => {
    const letterHash = primeAccept();
    db.application.updateMany.mockResolvedValue({ count: 0 });

    const res = await candidateDecideOfferAction(acceptForm({ signedName: "Candidate Tester", consent: "true", letterHash }));
    expect(res).toEqual({ success: false, error: "This application is no longer awaiting an offer decision." });
    // The error escapes the transaction callback, so the database rolls the evidence back.
    await expect(db.$transaction.mock.results[0].value).rejects.toThrow();
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
    expect(scheduleOutboxFlush).not.toHaveBeenCalled();
  });

  it("rejects a typed name that does not match the account name", async () => {
    const letterHash = primeAccept();
    const res = await candidateDecideOfferAction(acceptForm({ signedName: "Someone Else", consent: "true", letterHash }));
    expect(res.success).toBe(false);
    expect(res.success === false && res.fieldErrors?.signedName).toContain("Candidate Tester");
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
  });

  it("requires explicit consent before reaching the service", async () => {
    const letterHash = primeAccept();
    const res = await candidateDecideOfferAction(acceptForm({ signedName: "Candidate Tester", letterHash }));
    expect(res.success).toBe(false);
    expect(res.success === false && res.fieldErrors?.consent).toBeTruthy();
    expect(db.jobOffer.findUnique).not.toHaveBeenCalled();
  });

  it("never accepts without a signature (legacy accept request)", async () => {
    primeAccept();
    const res = await candidateDecideOfferAction(acceptForm({}));
    expect(res.success).toBe(false);
    expect(db.jobOffer.findUnique).not.toHaveBeenCalled();
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the letter changed after the candidate reviewed it", async () => {
    primeAccept();
    const res = await candidateDecideOfferAction(
      acceptForm({ signedName: "Candidate Tester", consent: "true", letterHash: "0".repeat(64) })
    );
    expect(res.success === false && res.error).toMatch(/offer letter has changed/);
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
  });

  it.each([OfferStatus.ACCEPTED, OfferStatus.DRAFT, OfferStatus.REVOKED, OfferStatus.DECLINED])(
    "refuses to sign a %s offer",
    async (status) => {
      const row = offerRow(status, {}, ApplicationStatus.OFFERED);
      const letterHash = primeAccept(row);
      const res = await candidateDecideOfferAction(acceptForm({ signedName: "Candidate Tester", consent: "true", letterHash }));
      expect(res).toEqual({ success: false, error: "This offer is no longer open for a response." });
      expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
    }
  );

  it("refuses another user's offer", async () => {
    const row = offerRow(OfferStatus.EXTENDED);
    const letterHash = offerLetterHash(row);
    signInAs(OTHER_CANDIDATE_ID, [Role.CANDIDATE]);
    db.jobOffer.findUnique.mockResolvedValue(row);
    const res = await candidateDecideOfferAction(acceptForm({ signedName: "Candidate Tester", consent: "true", letterHash }));
    expect(res).toEqual({ success: false, error: "You are not authorized to respond to this job offer." });
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
  });

  it("keeps declining free of signatures", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    db.jobOffer.findUnique.mockResolvedValue(offerRow(OfferStatus.EXTENDED));
    const formData = new FormData();
    formData.append("offerId", OFFER_ID);
    formData.append("decision", "DECLINE");
    formData.append("declineReason", "Accepted another offer");

    const res = await candidateDecideOfferAction(formData);
    expect(res).toEqual({ success: true, data: { decision: "DECLINE" } });
    const { data } = db.jobOffer.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({ status: OfferStatus.DECLINED, declineReason: "Accepted another offer" });
    expect(data).not.toHaveProperty("signedName");
    expect(data).not.toHaveProperty("signedDocumentHash");
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });
});

describe("Offer projections expose signature evidence safely", () => {
  it("gives the candidate the letter hash for an open offer and staff none", async () => {
    const row = offerRow(OfferStatus.EXTENDED);
    db.jobOffer.findUnique.mockResolvedValue(row);
    const candidateView = await offerService.getOfferByApplicationId(
      asUser(CANDIDATE_ID, [Role.CANDIDATE], "Candidate Tester"),
      APP_ID
    );
    expect(candidateView?.letterHash).toBe(offerLetterHash(row));

    const staffView = await offerService.getOfferByApplicationId(asUser(HR_ID, [Role.HR]), APP_ID);
    expect(staffView?.letterHash).toBeNull();
  });

  it("shows staff the full evidence and the candidate only what they signed", async () => {
    db.jobOffer.findUnique.mockResolvedValue(signedRow());
    const staffView = await offerService.getOfferByApplicationId(asUser(HR_ID, [Role.HR]), APP_ID);
    expect(staffView?.signature).toMatchObject({
      signedName: "Candidate Tester",
      userAgent: "Mozilla/5.0",
      ipHashRecorded: true,
      documentMatches: true,
    });
    expect(JSON.stringify(staffView)).not.toContain("a".repeat(64));

    const candidateView = await offerService.getOfferByApplicationId(asUser(CANDIDATE_ID, [Role.CANDIDATE]), APP_ID);
    expect(candidateView?.signature).toEqual({
      signedName: "Candidate Tester",
      signedAt: new Date("2026-10-22T09:05:00.000Z"),
      documentHash: offerLetterHash(offerRow(OfferStatus.EXTENDED)),
    });
  });
});

describe("Offer acceptance confirmation email", () => {
  const payload = {
    recipientName: "<script>alert(1)</script>",
    designation: "Engineer & Lead",
    department: "Engineering",
    expectedJoiningDate: "2026-12-01T00:00:00.000Z",
    signedName: "Candidate <b>Tester</b>",
    signedAt: "2026-10-22T09:05:00.000Z",
    documentHashPrefix: "0123456789abcdef",
    applicationReference: "GARA-APP-42",
    portalPath: `/candidate/applications/${APP_ID}`,
  };

  it("escapes every value and links to the candidate portal", () => {
    const email = buildOfferAcceptedConfirmationEmail(payload);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<b>Tester</b>");
    expect(email.html).toContain(`/candidate/applications/${APP_ID}`);
    expect(email.text).toContain("0123456789abcdef");
    expect(email.subject).toBe("[GARA Innovation] Offer accepted: Engineer & Lead");
  });

  it("never links outside the portal and tolerates malformed payloads", () => {
    const email = renderOfferAcceptedConfirmationEmail({ ...payload, portalPath: "https://evil.example/phish" });
    expect(email.html).not.toContain("evil.example");
    expect(() => renderOfferAcceptedConfirmationEmail(null)).not.toThrow();
    expect(renderOfferAcceptedConfirmationEmail({ documentHashPrefix: "<x>" }).text).toContain("Document Hash: Not recorded");
  });
});

describe("Candidate offer screens", () => {
  it("links the letter, checks the signature locally and submits the evidence fields", async () => {
    const row = offerRow(OfferStatus.EXTENDED);
    db.jobOffer.findUnique.mockResolvedValue(row);
    const offer = await offerService.getOfferByApplicationId(
      asUser(CANDIDATE_ID, [Role.CANDIDATE], "Candidate Tester"),
      APP_ID
    );
    expect(offer).not.toBeNull();
    if (!offer) return;

    render(React.createElement(CandidateOfferView, { offer }));
    expect(screen.getByRole("link", { name: /review offer letter/i }).getAttribute("href")).toBe(
      `/api/offers/${OFFER_ID}/letter`
    );

    const accept = screen.getByRole("button", { name: /accept job offer/i });
    fireEvent.click(accept);
    expect(await screen.findByText("Type your full legal name to sign.")).toBeTruthy();
    expect(screen.getByText(/Tick the box to confirm/)).toBeTruthy();

    const nameInput = screen.getByLabelText(/full legal name/i);
    fireEvent.change(nameInput, { target: { value: "Someone Else" } });
    fireEvent.click(screen.getByLabelText(/I have read the offer letter and agree to accept it electronically/));
    fireEvent.click(accept);
    expect(await screen.findByText(/must match the name on your account: Candidate Tester/)).toBeTruthy();
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();

    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    fireEvent.change(nameInput, { target: { value: "candidate tester" } });
    fireEvent.click(accept);
    await waitFor(() => expect(db.jobOffer.updateMany).toHaveBeenCalledTimes(1));
    expect(db.jobOffer.updateMany.mock.calls[0][0].data).toMatchObject({
      status: OfferStatus.ACCEPTED,
      signedName: "candidate tester",
      signedDocumentHash: offerLetterHash(row),
    });
  });

  it("offers the signed letter in the read-only My Journey view without actions", () => {
    render(
      React.createElement(ReadOnlyOfferSummary, {
        offer: {
          id: OFFER_ID,
          status: OfferStatus.ACCEPTED,
          designation: "Platform Engineer",
          department: "Engineering",
          expectedJoiningDate: new Date("2026-12-01T00:00:00.000Z"),
          termsSummary: "Terms",
          decisionAt: new Date("2026-10-22T09:05:00.000Z"),
          signature: {
            signedName: "Candidate Tester",
            signedAt: new Date("2026-10-22T09:05:00.000Z"),
            documentHash: "0123456789abcdef".repeat(4),
          },
        },
      })
    );
    expect(screen.getByRole("link", { name: /download signed offer letter/i }).getAttribute("href")).toBe(
      `/api/offers/${OFFER_ID}/letter`
    );
    expect(screen.getByText(/Accepted electronically as/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
