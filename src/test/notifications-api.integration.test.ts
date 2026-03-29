/**
 * Request-level tests for GET /api/notifications routing (bell list).
 * Uses mocked Firestore + verifyIdToken; exercises the route’s filter path, not only helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const RECIPIENT_UID = "uid_recipient_1";

type NotifyRow = {
  id: string;
  recipientUserId: string;
  type: string;
  routingBucket: string;
  message: string;
  isRead: boolean;
  createdAt: { toDate: () => Date };
  metadata: Record<string, unknown>;
  actorUserId: string;
  fileId: null;
  commentId: null;
  shareId: null;
};

let rows: NotifyRow[] = [];

function makeFirestore() {
  return {
    collection(col: string) {
      if (col !== "notifications") {
        return {
          doc: () => ({
            get: async () => ({ exists: false, data: () => undefined }),
          }),
        };
      }

      const chain: {
        _recipient?: string;
        where(field: string, _op: string, val: unknown): typeof chain;
        orderBy(): typeof chain;
        limit(): typeof chain;
        startAfter(): typeof chain;
        get(): Promise<{ docs: Array<{ id: string; data: () => Omit<NotifyRow, "id"> }> }>;
      } = {
        where(field: string, _op: string, val: unknown) {
          if (field === "recipientUserId") chain._recipient = val as string;
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit() {
          return chain;
        },
        startAfter() {
          return chain;
        },
        async get() {
          const uid = chain._recipient ?? "";
          const filtered = rows
            .filter((r) => r.recipientUserId === uid)
            .sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
          return {
            docs: filtered.map((r) => {
              const { id, ...payload } = r;
              return {
                id,
                data: () => payload,
              };
            }),
          };
        },
      };

      return {
        ...chain,
        doc(id: string) {
          return {
            get: async () => {
              const r = rows.find((x) => x.id === id);
              if (!r) return { exists: false, data: () => undefined };
              const { id: rid, ...payload } = r;
              return { exists: true, id: rid, data: () => payload };
            },
          };
        },
      };
    },
  };
}

vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: vi.fn(),
  getAdminFirestore: () => makeFirestore(),
}));

import { verifyIdToken } from "@/lib/firebase-admin";
import { GET as notificationsGET } from "@/app/api/notifications/route";

describe("GET /api/notifications routing", () => {
  beforeEach(() => {
    rows = [];
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: RECIPIENT_UID } as never);
  });

  it("returns personal-shell-first notifications when routing=consumer even if Firestore routingBucket was destination-scoped", async () => {
    rows.push({
      id: "doc_invite_1",
      recipientUserId: RECIPIENT_UID,
      type: "personal_team_invited",
      routingBucket: "team:owner_stale",
      message: "Someone invited you",
      isRead: false,
      createdAt: { toDate: () => new Date("2024-06-01T12:00:00Z") },
      metadata: { teamOwnerUserId: "owner_stale", actorDisplayName: "Owner" },
      actorUserId: "owner_stale",
      fileId: null,
      commentId: null,
      shareId: null,
    });

    const res = await notificationsGET(
      new Request("http://localhost/api/notifications?routing=consumer&limit=20", {
        headers: { Authorization: "Bearer testtoken" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe("personal_team_invited");
  });

  it("does not return that invite for mismatched team or enterprise routing query", async () => {
    rows.push({
      id: "doc_invite_2",
      recipientUserId: RECIPIENT_UID,
      type: "org_seat_invite",
      routingBucket: "enterprise:org_stale",
      message: "Org invite",
      isRead: false,
      createdAt: { toDate: () => new Date("2024-06-02T12:00:00Z") },
      metadata: { orgId: "org_real", orgName: "Acme", actorDisplayName: "Admin" },
      actorUserId: "admin1",
      fileId: null,
      commentId: null,
      shareId: null,
    });

    for (const routing of [`team:other_owner`, `enterprise:org_real`, `enterprise:wrong`]) {
      const res = await notificationsGET(
        new Request(`http://localhost/api/notifications?routing=${encodeURIComponent(routing)}&limit=20`, {
          headers: { Authorization: "Bearer testtoken" },
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notifications).toHaveLength(0);
    }
  });
});
