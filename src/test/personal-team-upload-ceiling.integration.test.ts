/**
 * Upload enforcement uses the team owner's purchased plan as the hard ceiling for all
 * team-folder billable usage, regardless of per-member fixed cap headroom.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRODUCT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-constants";
import {
  PERSONAL_TEAMS_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { createPersonalTeamIntegrationDb } from "./personal-team-integration-db";

const POOL_9_TB = 9 * 1024 ** 4;
const TIER_5_TB = PRODUCT_SEAT_STORAGE_BYTES[6];

const U = { owner: "uid_upload_owner", member: "uid_upload_member" };
const DRIVE_ID = "linked_drive_team_1";

type HarnessDb = ReturnType<typeof createPersonalTeamIntegrationDb>;

const testHarness: { db: HarnessDb | null; verifyIdToken: ReturnType<typeof vi.fn> } = {
  db: null,
  verifyIdToken: vi.fn(),
};

function resetHarnessDb() {
  testHarness.db = createPersonalTeamIntegrationDb();
}
resetHarnessDb();

vi.mock("@/lib/storage-lifecycle", () => ({
  assertStorageLifecycleAllowsAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: (...args: unknown[]) =>
    (testHarness.verifyIdToken as (...a: unknown[]) => Promise<unknown>)(...args),
  getAdminFirestore: () => {
    if (!testHarness.db) throw new Error("testHarness.db not initialized");
    return testHarness.db.firestore;
  },
  getAdminAuth: () => ({
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
  }),
}));

import {
  checkUserCanUpload,
  StorageQuotaDeniedError,
} from "@/lib/enterprise-storage";

beforeEach(() => {
  resetHarnessDb();
});

describe("checkUserCanUpload personal-team drive", () => {
  it("denies member upload when owner billable totals reach plan even if seat cap has headroom", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.owner, {
      plan_id: "video",
      display_name: "Owner",
      team_seat_counts: { none: 10, gallery: 0, editor: 0, fullframe: 0 },
      storage_lifecycle_status: "active",
      billing_status: "active",
      personal_status: "active",
      storage_quota_bytes: POOL_9_TB,
    });
    db.seedDoc("profiles", U.member, {
      plan_id: "free",
      display_name: "Member",
      billing_status: "active",
      storage_quota_bytes: 50 * 1024 ** 3,
    });
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.owner, {
      team_id: U.owner,
      owner_user_id: U.owner,
      status: "active",
    });
    const seatId = personalTeamSeatDocId(U.owner, U.member);
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, seatId, {
      team_owner_user_id: U.owner,
      member_user_id: U.member,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.member}@test.local`,
      storage_quota_bytes: TIER_5_TB,
      quota_mode: "fixed",
    });
    db.seedDoc("linked_drives", DRIVE_ID, {
      userId: U.owner,
      organization_id: null,
      personal_team_owner_id: U.owner,
    });
    db.seedDoc("backup_files", "bf1", {
      userId: U.member,
      personal_team_owner_id: U.owner,
      organization_id: null,
      size_bytes: POOL_9_TB - 500,
      lifecycle_state: "active",
    });

    let thrown: unknown;
    try {
      await checkUserCanUpload(U.member, 1000, DRIVE_ID);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(StorageQuotaDeniedError);
    const err = thrown as StorageQuotaDeniedError;
    expect(err.storage_denial.denial_reason).toBe("organization_pool");
    expect(err.storage_denial.usage_scope).toBe("personal_team_workspace");
    expect(err.storage_denial.quota_bytes).toBe(POOL_9_TB);
  });

  it("counts trashed team-folder files toward owner plan (trash does not free pool headroom)", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.owner, {
      plan_id: "video",
      display_name: "Owner",
      team_seat_counts: { none: 10, gallery: 0, editor: 0, fullframe: 0 },
      storage_lifecycle_status: "active",
      billing_status: "active",
      personal_status: "active",
      storage_quota_bytes: POOL_9_TB,
    });
    db.seedDoc("profiles", U.member, {
      plan_id: "free",
      display_name: "Member",
      billing_status: "active",
      storage_quota_bytes: 50 * 1024 ** 3,
    });
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.owner, {
      team_id: U.owner,
      owner_user_id: U.owner,
      status: "active",
    });
    const seatId = personalTeamSeatDocId(U.owner, U.member);
    db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, seatId, {
      team_owner_user_id: U.owner,
      member_user_id: U.member,
      seat_access_level: "none",
      status: "active",
      invited_email: `${U.member}@test.local`,
      storage_quota_bytes: TIER_5_TB,
      quota_mode: "fixed",
    });
    db.seedDoc("linked_drives", DRIVE_ID, {
      userId: U.owner,
      organization_id: null,
      personal_team_owner_id: U.owner,
    });
    db.seedDoc("backup_files", "bf_trashed", {
      userId: U.member,
      personal_team_owner_id: U.owner,
      organization_id: null,
      size_bytes: POOL_9_TB - 500,
      lifecycle_state: "trashed",
      deleted_at: new Date(),
    });

    let thrown: unknown;
    try {
      await checkUserCanUpload(U.member, 1000, DRIVE_ID);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(StorageQuotaDeniedError);
  });
});
