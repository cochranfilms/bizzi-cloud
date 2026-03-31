/**
 * Support submit + admin PATCH behavior with mocked Firestore, EmailJS, notifications.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ticketStore: Record<string, Record<string, unknown>> = {};
let ticketIdSeq = 0;

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    arrayUnion: (...els: unknown[]) => ({ __arrayUnion: els }),
  },
}));

vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: vi.fn(),
  getAdminAuth: vi.fn(() => ({
    getUser: vi.fn().mockImplementation(async (uid: string) => ({
      uid,
      email: `${uid}@test.local`,
      displayName: "Test",
    })),
  })),
  getAdminFirestore: vi.fn(() => ({
    collection: (name: string) => {
      if (name !== "support_tickets") {
        return {
          add: vi.fn(),
          doc: () => ({ get: vi.fn(), update: vi.fn() }),
        };
      }
      return {
        add: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
          const id = `ticket_${++ticketIdSeq}`;
          ticketStore[id] = { ...data };
          return { id };
        }),
        doc: (id: string) => ({
          get: vi.fn().mockImplementation(async () => {
            const d = ticketStore[id];
            if (!d) return { exists: false };
            return { exists: true, data: () => ({ ...d }) };
          }),
          update: vi.fn().mockImplementation(async (patch: Record<string, unknown>) => {
            const cur = { ...(ticketStore[id] ?? {}) };
            if ("status" in patch) cur.status = patch.status;
            if ("updatedAt" in patch) cur.updatedAt = patch.updatedAt;
            const rawHist = patch.statusHistory as { __arrayUnion?: unknown[] } | undefined;
            if (rawHist && Array.isArray(rawHist.__arrayUnion)) {
              const prev = Array.isArray(cur.statusHistory) ? cur.statusHistory : [];
              cur.statusHistory = [...prev, ...rawHist.__arrayUnion];
            }
            ticketStore[id] = cur;
          }),
        }),
      };
    },
  })),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminAuth: vi.fn(),
}));

const sendOps = vi.fn().mockResolvedValue(undefined);
const sendConfirm = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/emailjs", () => ({
  sendSupportTicketEmail: (...args: unknown[]) => sendOps(...args),
  sendSupportTicketConfirmationEmail: (...args: unknown[]) => sendConfirm(...args),
}));

const createNotif = vi.fn().mockResolvedValue("nid");
vi.mock("@/lib/notification-service", () => ({
  createNotification: (...args: unknown[]) => createNotif(...args),
}));

import { verifyIdToken } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { POST as submitPOST } from "@/app/api/support/submit/route";
import { PATCH as supportPATCH } from "@/app/api/admin/support/[ticketId]/route";

function auth(uid: string) {
  return { Authorization: `Bearer fake-${uid}` };
}

beforeEach(() => {
  Object.keys(ticketStore).forEach((k) => delete ticketStore[k]);
  ticketIdSeq = 0;
  vi.mocked(verifyIdToken).mockImplementation(async (tok: string) => {
    const m = /^fake-(.+)$/.exec(String(tok).trim());
    const uid = m?.[1] ?? "u1";
    return { uid, email: `${uid}@test.local` } as never;
  });
  vi.mocked(requireAdminAuth).mockResolvedValue({
    uid: "admin1",
    email: "admin@test.local",
  } as never);
  sendOps.mockClear();
  sendConfirm.mockClear();
  createNotif.mockClear();
  sendOps.mockResolvedValue(undefined);
  sendConfirm.mockResolvedValue(undefined);
  createNotif.mockResolvedValue("nid");
});

describe("POST /api/support/submit", () => {
  it("persists ticket without priority and returns 200", async () => {
    const res = await submitPOST(
      new Request("http://localhost/api/support/submit", {
        method: "POST",
        headers: { ...auth("user_a"), "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Need help",
          message: "Describe issue here ok",
          issueType: "billing",
        }),
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { id: string };
    expect(j.id).toMatch(/^ticket_/);
    expect(ticketStore[j.id]!.priority).toBeUndefined();
    expect(ticketStore[j.id]!.issueType).toBe("billing");
    expect(sendOps).toHaveBeenCalled();
    expect(sendConfirm).toHaveBeenCalled();
    expect(createNotif).toHaveBeenCalledWith(
      expect.objectContaining({ type: "support_ticket_submitted" })
    );
  });

  it("returns 200 when ops and confirmation email and notification fail", async () => {
    sendOps.mockRejectedValueOnce(new Error("email down"));
    sendConfirm.mockRejectedValueOnce(new Error("email down"));
    createNotif.mockRejectedValueOnce(new Error("notify down"));

    const res = await submitPOST(
      new Request("http://localhost/api/support/submit", {
        method: "POST",
        headers: { ...auth("user_b"), "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Subj here",
          message: "Message long",
          issueType: "other",
        }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("returns 429 after rate limit exceeded", async () => {
    const uid = "rate_user";
    const mk = () =>
      submitPOST(
        new Request("http://localhost/api/support/submit", {
          method: "POST",
          headers: { ...auth(uid), "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: "abc",
            message: "1234567890",
            issueType: "other",
          }),
        })
      );
    expect((await mk()).status).toBe(200);
    expect((await mk()).status).toBe(200);
    expect((await mk()).status).toBe(200);
    expect((await mk()).status).toBe(429);
  });
});

describe("PATCH /api/admin/support/[ticketId]", () => {
  it("returns noop without mutating ticket when status unchanged", async () => {
    ticketStore["t1"] = {
      subject: "S",
      message: "M",
      status: "open",
      affectedUserId: "u1",
      affectedUserEmail: "u1@test.local",
      issueType: "other",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const before = JSON.stringify(ticketStore["t1"]);

    const res = await supportPATCH(
      new Request("http://localhost/api", {
        method: "PATCH",
        headers: { ...auth("admin1"), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      }),
      { params: Promise.resolve({ ticketId: "t1" }) }
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { noop?: boolean };
    expect(j.noop).toBe(true);
    expect(JSON.stringify(ticketStore["t1"])).toBe(before);
    expect(createNotif).not.toHaveBeenCalled();
  });

  it("notifies in_progress on transition to in_progress", async () => {
    ticketStore["t2"] = {
      subject: "Sub",
      status: "open",
      affectedUserId: "cust",
      affectedUserEmail: "c@test.local",
      issueType: "other",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await supportPATCH(
      new Request("http://localhost/api", {
        method: "PATCH",
        headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      }),
      { params: Promise.resolve({ ticketId: "t2" }) }
    );
    expect(res.status).toBe(200);
    expect(createNotif).toHaveBeenCalledWith(
      expect.objectContaining({ type: "support_ticket_in_progress", recipientUserId: "cust" })
    );
    expect(ticketStore["t2"].status).toBe("in_progress");
    expect(Array.isArray(ticketStore["t2"].statusHistory)).toBe(true);
  });

  it("notifies resolved and succeeds if notification throws", async () => {
    createNotif.mockRejectedValueOnce(new Error("fail"));
    ticketStore["t3"] = {
      subject: "Sub",
      status: "in_progress",
      affectedUserId: "cust2",
      affectedUserEmail: "c2@test.local",
      issueType: "other",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await supportPATCH(
      new Request("http://localhost/api", {
        method: "PATCH",
        headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      }),
      { params: Promise.resolve({ ticketId: "t3" }) }
    );
    expect(res.status).toBe(200);
    expect(ticketStore["t3"].status).toBe("resolved");
  });
});
