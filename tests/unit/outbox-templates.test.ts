import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    notificationOutbox: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import { OutboxProcessorService, type EmailTransportAdapter } from "@/infrastructure/email/outbox-processor";

function queued(templateName: string, payload: Record<string, unknown>) {
  return {
    id: "row-1",
    recipientEmail: "asha@example.com",
    templateName,
    payload,
    status: "PENDING",
    attempts: 0,
    maxAttempts: 5,
    claimedAt: null,
    sentAt: null,
  };
}

describe("Outbox template wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    db.notificationOutbox.update.mockResolvedValue({});
  });

  it("renders the e-sign acceptance confirmation with its own template, escaped", async () => {
    const sendEmail = vi.fn<EmailTransportAdapter["sendEmail"]>().mockResolvedValue(undefined);
    db.notificationOutbox.findUnique.mockResolvedValue(
      queued("OFFER_ACCEPTED_CONFIRMATION", {
        recipientName: "Asha <script>",
        designation: "Software Engineer",
        department: "Engineering",
        expectedJoiningDate: "2026-11-02T00:00:00.000Z",
        signedName: "Asha Rao",
        signedAt: "2026-10-25T10:00:00.000Z",
        documentHashPrefix: "0123456789abcdef",
        applicationReference: "GARA-2026-APP-ABC123",
        portalPath: "/candidate/applications/app-1",
      })
    );

    await expect(new OutboxProcessorService({ sendEmail }).processSingleRecord("row-1")).resolves.toBe("SENT");

    const message = sendEmail.mock.calls[0][0];
    // Not the generic fallback (which lists raw payload keys).
    expect(message.html).not.toContain("documentHashPrefix");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});
