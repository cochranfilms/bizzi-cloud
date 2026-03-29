/**
 * Personal team close-workspace orchestration (mocked Firestore + finalize / Stripe).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import {
  PERSONAL_TEAMS_COLLECTION,
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { createPersonalTeamIntegrationDb } from "./personal-team-integration-db";

const U = { owner: "uid_close_owner", member: "uid_close_member" };

const finalizeMock = vi.hoisted(() => vi.fn());
const updateSubMock = vi.hoisted(() => vi.fn());
const stripeRetrieveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/personal-team-container-finalize", () => ({
  finalizePersonalTeamColdStorage: (...args: unknown[]) => finalizeMock(...args),
}));

vi.mock("@/lib/stripe-update-subscription", () => ({
  updateSubscriptionWithProration: (...args: unknown[]) => updateSubMock(...args),
}));

type HarnessDb = ReturnType<typeof createPersonalTeamIntegrationDb>;

const testHarness: { db: HarnessDb | null } = { db: null };

function resetHarnessDb() {
  testHarness.db = createPersonalTeamIntegrationDb();
}

resetHarnessDb();

vi.mock("@/lib/firebase-admin", () => ({
  getAdminFirestore: () => {
    if (!testHarness.db) throw new Error("testHarness.db not initialized");
    return testHarness.db.firestore;
  },
  verifyIdToken: vi.fn(),
  getAdminAuth: () => ({
    getUser: vi.fn(async (uid: string) => ({ uid, email: `${uid}@test.local` })),
  }),
}));

vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/notification-service", () => ({
  createNotification: vi.fn().mockResolvedValue("nid"),
  getActorDisplayName: vi.fn().mockResolvedValue("Owner"),
}));

vi.mock("@/lib/stripe", () => ({
  getStripeInstance: vi.fn(() => ({
    subscriptions: { retrieve: stripeRetrieveMock },
  })),
}));

import { executePersonalTeamWorkspaceClose } from "@/lib/personal-team-close-workspace";

function videoProfile(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: "video",
    display_name: "Owner",
    team_seat_counts: { none: 0, gallery: 0, editor: 0, fullframe: 0 },
    stripe_subscription_id: "sub_test_1",
    billing_status: "active",
    storage_lifecycle_status: "active",
    personal_status: "active",
    addon_ids: [],
    storage_addon_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetHarnessDb();
  finalizeMock.mockReset();
  updateSubMock.mockReset();
  stripeRetrieveMock.mockReset();
  updateSubMock.mockResolvedValue(NextResponse.json({ ok: true }));
  stripeRetrieveMock.mockResolvedValue({
    status: "active",
    items: {
      data: [
        {
          deleted: false,
          id: "si_test_plan",
          price: {
            recurring: { interval: "month" },
            metadata: { plan_id: "video" },
          },
        },
        {
          deleted: false,
          id: "si_test_seat",
          quantity: 2,
          price: { metadata: { personal_team_seat_access: "none", type: "personal_team_seat" } },
        },
      ],
    },
  });
  finalizeMock.mockResolvedValue({
    teamOwnerUserId: U.owner,
    skipped: false,
    migrated: 0,
  });
});

describe("executePersonalTeamWorkspaceClose", () => {
  it("revokes members, cancels invites, finalize, without Stripe when no purchased seats", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.owner, videoProfile());
    db.seedDoc("profiles", U.member, videoProfile({ display_name: "Member" }));
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.owner, {
      team_id: U.owner,
      owner_user_id: U.owner,
      status: "active",
    });
    db.seedDoc(PERSONAL_TEAM_SETTINGS_COLLECTION, U.owner, {
      team_name: "Acme Team",
      logo_url: "https://example.com/l.png",
    });
    db.seedDoc(
      PERSONAL_TEAM_INVITES_COLLECTION,
      "inv1",
      {
        team_owner_user_id: U.owner,
        invited_email: "x@y.com",
        status: "pending",
        seat_access_level: "none",
      }
    );
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId(U.owner, U.member), {
      team_owner_user_id: U.owner,
      member_user_id: U.member,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.member}@test.local`,
    });

    const result = await executePersonalTeamWorkspaceClose(U.owner);
    expect(result.ok).toBe(true);
    expect(result.invites_cancelled).toBe(1);
    expect(result.members_revoked).toBe(1);
    expect(updateSubMock).not.toHaveBeenCalled();
    expect(finalizeMock).toHaveBeenCalledTimes(1);

    const inv = db.raw.get(`${PERSONAL_TEAM_INVITES_COLLECTION}/inv1`) as { status?: string };
    expect(inv.status).toBe("cancelled");

    const seat = db.raw.get(`${PERSONAL_TEAM_SEATS_COLLECTION}/${personalTeamSeatDocId(U.owner, U.member)}`) as {
      status?: string;
    };
    expect(seat.status).toBe("removed");

    const settings = db.raw.get(`${PERSONAL_TEAM_SETTINGS_COLLECTION}/${U.owner}`) ?? {};
    expect(settings.team_name).toBeUndefined();
    expect(settings.logo_url).toBeUndefined();

    const team = db.raw.get(`${PERSONAL_TEAMS_COLLECTION}/${U.owner}`) ?? {};
    expect(team.shutdown_pending).not.toBe(true);
  });

  it("resumes after finalize fails: second call completes without double Stripe update", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.owner, videoProfile({ team_seat_counts: { none: 2, gallery: 0, editor: 0, fullframe: 0 } }));
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.owner, {
      team_id: U.owner,
      owner_user_id: U.owner,
      status: "active",
    });
    db.seedDoc(PERSONAL_TEAM_SETTINGS_COLLECTION, U.owner, { team_name: "T" });

    finalizeMock.mockRejectedValueOnce(new Error("migrate_failed"));
    await expect(executePersonalTeamWorkspaceClose(U.owner)).rejects.toThrow("migrate_failed");
    expect(updateSubMock).toHaveBeenCalledTimes(1);

    finalizeMock.mockResolvedValue({
      teamOwnerUserId: U.owner,
      skipped: false,
      migrated: 1,
    });
    const result = await executePersonalTeamWorkspaceClose(U.owner);
    expect(result.ok).toBe(true);
    expect(updateSubMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(2);
  });
});
