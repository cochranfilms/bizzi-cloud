/**
 * API-level tests for personal-team fixed-cap pool enforcement (mocked Firestore + Auth).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRODUCT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-constants";
import {
  PERSONAL_TEAMS_COLLECTION,
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { createPersonalTeamIntegrationDb } from "./personal-team-integration-db";

const POOL_9_TB = 9 * 1024 ** 4;
const TIER_2_TB = PRODUCT_SEAT_STORAGE_BYTES[5];
const TIER_5_TB = PRODUCT_SEAT_STORAGE_BYTES[6];

const U = {
  owner: "uid_pool_owner",
  m1: "uid_pool_m1",
  m2: "uid_pool_m2",
};

type HarnessDb = ReturnType<typeof createPersonalTeamIntegrationDb>;

const testHarness: {
  db: HarnessDb | null;
  verifyIdToken: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  getUserByEmail: ReturnType<typeof vi.fn>;
} = {
  db: null,
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
  getUserByEmail: vi.fn(),
};

function resetHarnessDb() {
  testHarness.db = createPersonalTeamIntegrationDb();
}

resetHarnessDb();

vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: (...args: unknown[]) =>
    (testHarness.verifyIdToken as (...a: unknown[]) => Promise<unknown>)(...args),
  getAdminFirestore: () => {
    if (!testHarness.db) throw new Error("testHarness.db not initialized");
    return testHarness.db.firestore;
  },
  getAdminAuth: () => ({
    getUser: testHarness.getUser,
    getUserByEmail: testHarness.getUserByEmail,
  }),
}));

vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/emailjs", () => ({
  sendPersonalTeamInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notification-service", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  getActorDisplayName: vi.fn().mockResolvedValue("Actor"),
}));

import { POST as invitePOST } from "@/app/api/personal-team/invite/route";
import { PATCH as seatPATCH } from "@/app/api/personal-team/seats/[seatId]/route";
import { GET as membersGET } from "@/app/api/personal-team/members/route";
import { getPersonalTeamPoolAccounting } from "@/lib/personal-team-pool-accounting";

function authHeader(uid: string) {
  return { Authorization: `Bearer fake-${uid}` };
}

function videoTeamProfile(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: "video",
    display_name: "Test User",
    team_seat_counts: { none: 50, gallery: 10, editor: 10, fullframe: 10 },
    storage_lifecycle_status: "active",
    billing_status: "active",
    personal_status: "active",
    storage_quota_bytes: POOL_9_TB,
    ...overrides,
  };
}

function seedOwnerTeam(db: HarnessDb) {
  db.seedDoc("profiles", U.owner, videoTeamProfile());
  db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.owner, {
    team_id: U.owner,
    owner_user_id: U.owner,
    status: "active",
  });
}

beforeEach(() => {
  resetHarnessDb();
  testHarness.verifyIdToken.mockImplementation(async (tok: string) => {
    const m = /^fake-(.+)$/.exec(String(tok).trim());
    const uid = m?.[1] ?? "unknown_uid";
    return { uid, email: `${uid}@test.local` };
  });
  testHarness.getUser.mockImplementation(async (uid: string) => ({
    uid,
    email: `${uid}@test.local`,
  }));
  testHarness.getUserByEmail.mockImplementation(async (email: string) => {
    const local = email.split("@")[0];
    if (email.includes("no-account-")) {
      const err = new Error("User not found");
      (err as { code?: string }).code = "auth/user-not-found";
      throw err;
    }
    return { uid: local, email };
  });
});

describe("POST /api/personal-team/invite fixed-cap pool", () => {
  it("returns 400 when proposed fixed cap exceeds remaining assignable after pending reserves", async () => {
    const db = testHarness.db!;
    seedOwnerTeam(db);
    db.seedDoc(PERSONAL_TEAM_INVITES_COLLECTION, "pend_5tb", {
      team_owner_user_id: U.owner,
      invited_email: "first@example.com",
      seat_access_level: "none",
      invite_token_hash: "x",
      status: "pending",
      storage_quota_bytes: TIER_5_TB,
      quota_mode: "fixed",
    });

    const res = await invitePOST(
      new Request("http://localhost/api/personal-team/invite", {
        method: "POST",
        headers: { ...authHeader(U.owner), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "invitee-a@example.com",
          seat_access_level: "none",
          storage_quota_bytes: TIER_5_TB,
        }),
      })
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error ?? "").toMatch(/fixed cap exceeds/i);
  });

  it("allows unlimited (null) invite when assignable fixed budget is exhausted by pending reserves", async () => {
    const db = testHarness.db!;
    seedOwnerTeam(db);
    db.seedDoc(PERSONAL_TEAM_INVITES_COLLECTION, "pend_8tb", {
      team_owner_user_id: U.owner,
      invited_email: "first@example.com",
      seat_access_level: "none",
      invite_token_hash: "x",
      status: "pending",
      storage_quota_bytes: 8 * 1024 ** 4,
      quota_mode: "fixed",
    });

    testHarness.getUserByEmail.mockRejectedValueOnce(new Error("not found"));

    const res = await invitePOST(
      new Request("http://localhost/api/personal-team/invite", {
        method: "POST",
        headers: { ...authHeader(U.owner), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "no-account-unlimited@example.com",
          seat_access_level: "none",
          storage_quota_bytes: null,
        }),
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/personal-team/seats/[seatId] fixed-cap pool", () => {
  it("returns 400 when increasing fixed cap would exceed pool (no reclaim from same seat)", async () => {
    const db = testHarness.db!;
    seedOwnerTeam(db);
    db.seedDoc("profiles", U.m1, videoTeamProfile({ display_name: "M1" }));
    db.seedDoc("profiles", U.m2, videoTeamProfile({ display_name: "M2" }));
    const seat1 = personalTeamSeatDocId(U.owner, U.m1);
    const seat2 = personalTeamSeatDocId(U.owner, U.m2);
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, seat1, {
      team_owner_user_id: U.owner,
      member_user_id: U.m1,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.m1}@test.local`,
      storage_quota_bytes: TIER_2_TB,
      quota_mode: "fixed",
    });
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, seat2, {
      team_owner_user_id: U.owner,
      member_user_id: U.m2,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.m2}@test.local`,
      storage_quota_bytes: TIER_5_TB,
      quota_mode: "fixed",
    });

    const res = await seatPATCH(
      new Request("http://localhost/api/personal-team/seats/x", {
        method: "PATCH",
        headers: { ...authHeader(U.owner), "Content-Type": "application/json" },
        body: JSON.stringify({ storage_quota_bytes: TIER_5_TB }),
      }),
      { params: Promise.resolve({ seatId: seat1 }) }
    );
    expect(res.status).toBe(400);
  });

  it("allows PATCH when reclaimed bytes from the same seat cover the increase", async () => {
    const db = testHarness.db!;
    seedOwnerTeam(db);
    db.seedDoc("profiles", U.m1, videoTeamProfile({ display_name: "M1" }));
    db.seedDoc("profiles", U.m2, videoTeamProfile({ display_name: "M2" }));
    const seat1 = personalTeamSeatDocId(U.owner, U.m1);
    const seat2 = personalTeamSeatDocId(U.owner, U.m2);
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, seat1, {
      team_owner_user_id: U.owner,
      member_user_id: U.m1,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.m1}@test.local`,
      storage_quota_bytes: TIER_2_TB,
      quota_mode: "fixed",
    });
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, seat2, {
      team_owner_user_id: U.owner,
      member_user_id: U.m2,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.m2}@test.local`,
      storage_quota_bytes: TIER_2_TB,
      quota_mode: "fixed",
    });

    const res = await seatPATCH(
      new Request("http://localhost/api/personal-team/seats/x", {
        method: "PATCH",
        headers: { ...authHeader(U.owner), "Content-Type": "application/json" },
        body: JSON.stringify({ storage_quota_bytes: TIER_5_TB }),
      }),
      { params: Promise.resolve({ seatId: seat1 }) }
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/personal-team/members overview accounting", () => {
  it("returns pool fields consistent with getPersonalTeamPoolAccounting", async () => {
    const db = testHarness.db!;
    seedOwnerTeam(db);
    db.seedDoc("profiles", U.m1, videoTeamProfile({ display_name: "M1" }));
    const seat1 = personalTeamSeatDocId(U.owner, U.m1);
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, seat1, {
      team_owner_user_id: U.owner,
      member_user_id: U.m1,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.m1}@test.local`,
      storage_quota_bytes: TIER_2_TB,
      quota_mode: "fixed",
    });
    db.seedDoc(PERSONAL_TEAM_INVITES_COLLECTION, "pend", {
      team_owner_user_id: U.owner,
      invited_email: "pending@example.com",
      seat_access_level: "none",
      invite_token_hash: "y",
      status: "pending",
      storage_quota_bytes: TIER_5_TB,
      quota_mode: "fixed",
    });

    const adminProfile = videoTeamProfile();
    const acct = await getPersonalTeamPoolAccounting(U.owner, adminProfile);

    const res = await membersGET(
      new Request("http://localhost/api/personal-team/members", { headers: authHeader(U.owner) })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      overview: {
        team_quota_bytes: number;
        team_used_bytes: number;
        total_plan_billable_bytes: number;
        fixed_cap_allocated_bytes: number;
        fixed_cap_reserved_pending_invites_bytes: number;
        remaining_fixed_cap_allocatable_bytes: number;
        remaining_team_workspace_headroom_bytes: number;
        remaining_plan_headroom_bytes: number;
      };
    };

    expect(body.overview.team_quota_bytes).toBe(acct.admin_purchased_pool_bytes);
    expect(body.overview.team_used_bytes).toBe(acct.total_team_scoped_used_bytes);
    expect(body.overview.total_plan_billable_bytes).toBe(acct.total_billable_used_bytes);
    expect(body.overview.fixed_cap_allocated_bytes).toBe(acct.total_fixed_cap_allocated_bytes);
    expect(body.overview.fixed_cap_reserved_pending_invites_bytes).toBe(
      acct.total_fixed_cap_reserved_bytes
    );
    expect(body.overview.remaining_fixed_cap_allocatable_bytes).toBe(
      acct.remaining_fixed_cap_allocatable_bytes
    );
    expect(body.overview.remaining_team_workspace_headroom_bytes).toBe(
      acct.remaining_team_workspace_headroom_bytes
    );
    expect(body.overview.remaining_plan_headroom_bytes).toBe(acct.remaining_plan_headroom_bytes);
  });
});

describe("GET /api/personal-team/members removed seats serialization and used counts", () => {
  it("includes ISO removed_at/updated_at on historical seats and does not count removed/cold_storage in used", async () => {
    const db = testHarness.db!;
    seedOwnerTeam(db);
    db.seedDoc("profiles", U.m1, videoTeamProfile({ display_name: "M1" }));
    db.seedDoc("profiles", U.m2, videoTeamProfile({ display_name: "M2" }));
    const coldUid = "uid_pool_cold";
    db.seedDoc("profiles", coldUid, videoTeamProfile({ display_name: "Cold" }));

    const ts = (iso: string) => ({ toDate: () => new Date(iso) });

    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId(U.owner, U.m1), {
      team_owner_user_id: U.owner,
      member_user_id: U.m1,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.m1}@test.local`,
    });
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId(U.owner, U.m2), {
      team_owner_user_id: U.owner,
      member_user_id: U.m2,
      seat_access_level: "editor",
      status: "removed",
      invited_email: `${U.m2}@test.local`,
      removed_at: ts("2024-03-01T12:00:00.000Z"),
      updated_at: ts("2024-03-02T15:30:00.000Z"),
    });
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId(U.owner, coldUid), {
      team_owner_user_id: U.owner,
      member_user_id: coldUid,
      seat_access_level: "fullframe",
      status: "cold_storage",
      invited_email: `${coldUid}@test.local`,
      updated_at: ts("2024-01-10T00:00:00.000Z"),
    });

    const res = await membersGET(
      new Request("http://localhost/api/personal-team/members", { headers: authHeader(U.owner) })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: Array<{
        status: string;
        removed_at: string | null;
        updated_at: string | null;
      }>;
      overview: { used: { none: number; editor: number; fullframe: number } };
    };

    expect(body.overview.used.none).toBe(1);
    expect(body.overview.used.editor).toBe(0);
    expect(body.overview.used.fullframe).toBe(0);

    const removed = body.members.filter((m) => m.status === "removed");
    const coldRow = body.members.filter((m) => m.status === "cold_storage");
    expect(removed).toHaveLength(1);
    expect(coldRow).toHaveLength(1);
    expect(removed[0]?.removed_at).toBe("2024-03-01T12:00:00.000Z");
    expect(removed[0]?.updated_at).toBe("2024-03-02T15:30:00.000Z");
    expect(coldRow[0]?.updated_at).toBe("2024-01-10T00:00:00.000Z");
  });
});

describe("regression: 9 TB pool, two 2 TB seats", () => {
  it("allows first 5 TB pending invite (4 + 5 = 9) then blocks another fixed tier that would exceed 9 TB", async () => {
    const db = testHarness.db!;
    seedOwnerTeam(db);
    db.seedDoc("profiles", U.m1, videoTeamProfile({ display_name: "M1" }));
    db.seedDoc("profiles", U.m2, videoTeamProfile({ display_name: "M2" }));
    for (const [mid, em] of [
      [U.m1, `${U.m1}@test.local`],
      [U.m2, `${U.m2}@test.local`],
    ] as const) {
      db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId(U.owner, mid), {
        team_owner_user_id: U.owner,
        member_user_id: mid,
        seat_access_level: "none",
        status: "active",
        invited_email: em,
        storage_quota_bytes: TIER_2_TB,
        quota_mode: "fixed",
      });
    }

    testHarness.getUserByEmail.mockRejectedValueOnce(new Error("not found"));
    const ok5 = await invitePOST(
      new Request("http://localhost/api/personal-team/invite", {
        method: "POST",
        headers: { ...authHeader(U.owner), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "five-tb-pending@example.com",
          seat_access_level: "none",
          storage_quota_bytes: TIER_5_TB,
        }),
      })
    );
    expect(ok5.status).toBe(200);

    testHarness.getUserByEmail.mockRejectedValueOnce(new Error("not found"));
    const block2tb = await invitePOST(
      new Request("http://localhost/api/personal-team/invite", {
        method: "POST",
        headers: { ...authHeader(U.owner), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "two-tb-overflow@example.com",
          seat_access_level: "none",
          storage_quota_bytes: TIER_2_TB,
        }),
      })
    );
    expect(block2tb.status).toBe(400);
    const err = (await block2tb.json()) as { error?: string };
    expect(err.error ?? "").toMatch(/fixed cap exceeds/i);
  });
});
