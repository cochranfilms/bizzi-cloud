/**
 * Integration-level tests for personal-team HTTP handlers (mocked Firestore + Auth).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashInviteToken } from "@/lib/invite-token";
import {
  PERSONAL_TEAMS_COLLECTION,
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { createPersonalTeamIntegrationDb } from "./personal-team-integration-db";

const U = {
  admin4: "uid_admin_o4",
  memberCap: "uid_member_cap",
  memberNew: "uid_member_new",
  o1: "uid_owner_1",
  o2: "uid_owner_2",
  o3: "uid_owner_3",
  combo: "uid_combo_owner_member",
  ownerA: "uid_ws_owner_a",
  ownerB: "uid_ws_owner_b",
  leaver: "uid_leaver",
  removeAdmin: "uid_remove_admin",
  removeMember: "uid_remove_member",
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
import { POST as acceptPOST } from "@/app/api/personal-team/accept-invite/route";
import { POST as leavePOST } from "@/app/api/personal-team/leave/route";
import { POST as removePOST } from "@/app/api/personal-team/remove/route";
import { GET as workspacesGET } from "@/app/api/account/workspaces/route";
import { POST as ensureShellPOST } from "@/app/api/personal-team/ensure-shell/route";
import { GET as shellStateGET } from "@/app/api/personal-team/shell-state/route";

function authHeader(uid: string) {
  return { Authorization: `Bearer fake-${uid}` };
}

function videoTeamProfile(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: "video",
    display_name: "Test User",
    team_seat_counts: { none: 10, gallery: 2, editor: 2, fullframe: 2 },
    storage_lifecycle_status: "active",
    billing_status: "active",
    personal_status: "active",
    ...overrides,
  };
}

async function invokeJson(
  handler: (req: Request) => Promise<Response>,
  uid: string,
  body: Record<string, unknown>
) {
  const r = await handler(
    new Request("http://localhost/api", {
      method: "POST",
      headers: { ...authHeader(uid), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  let parsed: unknown = null;
  try {
    parsed = await r.json();
  } catch {
    /* empty */
  }
  return { status: r.status, body: parsed };
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
    if (local === "uid_member_cap" || local.startsWith("uid_")) {
      return { uid: local, email };
    }
    return { uid: `resolved_${local}`, email };
  });
});

describe("POST /api/personal-team/invite cap (3 non-owned teams)", () => {
  it("returns 400 when target user already has 3 active non-owned memberships", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.admin4, videoTeamProfile({ display_name: "Admin" }));
    db.seedDoc("profiles", U.memberCap, videoTeamProfile({ display_name: "CapMember" }));
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.admin4, {
      team_id: U.admin4,
      owner_user_id: U.admin4,
      status: "active",
    });
    for (const o of [U.o1, U.o2, U.o3]) {
      db.seedDoc("profiles", o, videoTeamProfile({ display_name: `Owner ${o}` }));
      db.seedDoc(PERSONAL_TEAMS_COLLECTION, o, {
        team_id: o,
        owner_user_id: o,
        status: "active",
      });
      const sid = personalTeamSeatDocId(o, U.memberCap);
      db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, sid, {
        team_id: o,
        team_owner_user_id: o,
        member_user_id: U.memberCap,
        seat_access_level: "none",
        status: "active",
        invited_email: `${U.memberCap}@test.local`,
      });
    }

    testHarness.getUserByEmail.mockResolvedValueOnce({
      uid: U.memberCap,
      email: `${U.memberCap}@test.local`,
    });

    const req = new Request("http://localhost/api/personal-team/invite", {
      method: "POST",
      headers: { ...authHeader(U.admin4), "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${U.memberCap}@test.local`,
        seat_access_level: "none",
      }),
    });
    const res = await invitePOST(req);
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error ?? "").toMatch(/maximum number of other personal teams/i);
  });
});

describe("POST /api/personal-team/invite success (existing user)", () => {
  it("creates pending email invite (no active seat) when capacity and plan allow", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.admin4, videoTeamProfile());
    db.seedDoc("profiles", U.memberNew, videoTeamProfile({ display_name: "New" }));
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.admin4, {
      team_id: U.admin4,
      owner_user_id: U.admin4,
      status: "active",
    });

    testHarness.getUserByEmail.mockResolvedValueOnce({
      uid: U.memberNew,
      email: `${U.memberNew}@test.local`,
    });

    const res = await invitePOST(
      new Request("http://localhost/api/personal-team/invite", {
        method: "POST",
        headers: { ...authHeader(U.admin4), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${U.memberNew}@test.local`,
          seat_access_level: "none",
        }),
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean; pending_invite?: boolean; invite_id?: string };
    expect(j.ok).toBe(true);
    expect(j.pending_invite).toBe(true);
    expect(j.invite_id).toBeTruthy();
    const seatKey = `${PERSONAL_TEAM_SEATS_COLLECTION}/${personalTeamSeatDocId(U.admin4, U.memberNew)}`;
    expect(db.raw.has(seatKey)).toBe(false);
    const inv = db.raw.get(`${PERSONAL_TEAM_INVITES_COLLECTION}/${j.invite_id}`);
    expect(inv?.status).toBe("pending");
    expect(inv?.quota_mode).toBe("org_unlimited");
  });
});

describe("POST /api/personal-team/accept-invite idempotent", () => {
  it("returns already_member when seat is already enterable and invite still pending", async () => {
    const db = testHarness.db!;
    const teamOwner = U.admin4;
    const member = U.memberNew;
    const token = "plain-invite-token-xyz";
    const invitedEmail = `${member}@test.local`;
    db.seedDoc("profiles", member, videoTeamProfile({ display_name: "Joiner" }));
    db.seedDoc(PERSONAL_TEAM_INVITES_COLLECTION, "inv_pending_1", {
      team_owner_user_id: teamOwner,
      invited_email: invitedEmail,
      seat_access_level: "gallery",
      invite_token_hash: hashInviteToken(token),
      status: "pending",
    });
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(teamOwner, member),
      {
        team_owner_user_id: teamOwner,
        member_user_id: member,
        seat_access_level: "gallery",
        status: "active",
        invited_email: invitedEmail,
      }
    );

    const res = await invokeJson(acceptPOST, member, { token });
    expect(res.status).toBe(200);
    const j = res.body as { ok?: boolean; already_member?: boolean };
    expect(j.ok).toBe(true);
    expect(j.already_member).toBe(true);
  });

  it("returns 400 when accepting would exceed 3 non-owned active teams", async () => {
    const db = testHarness.db!;
    const newOwner = "uid_accept_block_owner";
    const member = "uid_accept_block_member";
    db.seedDoc("profiles", member, videoTeamProfile({ display_name: "Blocked" }));
    for (const o of [U.o1, U.o2, U.o3]) {
      db.seedDoc(PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId(o, member), {
        team_owner_user_id: o,
        member_user_id: member,
        seat_access_level: "none",
        status: "active",
        invited_email: `${member}@test.local`,
      });
    }
    const token = "cap-token-abc";
    db.seedDoc(PERSONAL_TEAM_INVITES_COLLECTION, "inv_cap_block", {
      team_owner_user_id: newOwner,
      invited_email: `${member}@test.local`,
      seat_access_level: "none",
      invite_token_hash: hashInviteToken(token),
      status: "pending",
    });

    const res = await invokeJson(acceptPOST, member, { token });
    expect(res.status).toBe(400);
    const j = res.body as { error?: string };
    expect(j.error ?? "").toMatch(/maximum number of other personal teams/i);
  });
});

describe("POST /api/personal-team/leave idempotent", () => {
  it("returns already_left when seat already removed", async () => {
    const db = testHarness.db!;
    const teamOwner = U.admin4;
    const member = U.leaver;
    db.seedDoc("profiles", member, videoTeamProfile());
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(teamOwner, member),
      {
        team_owner_user_id: teamOwner,
        member_user_id: member,
        seat_access_level: "none",
        status: "removed",
      }
    );

    const res = await leavePOST(
      new Request("http://localhost/api/personal-team/leave", {
        method: "POST",
        headers: { ...authHeader(member), "Content-Type": "application/json" },
        body: JSON.stringify({ team_owner_user_id: teamOwner }),
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean; already_left?: boolean };
    expect(j.ok).toBe(true);
    expect(j.already_left).toBe(true);
  });

  it("first leave transitions to removed; second call is idempotent", async () => {
    const db = testHarness.db!;
    const teamOwner = U.admin4;
    const member = U.leaver;
    db.seedDoc("profiles", member, videoTeamProfile());
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(teamOwner, member),
      {
        team_owner_user_id: teamOwner,
        member_user_id: member,
        seat_access_level: "none",
        status: "active",
      }
    );

    const r1 = await leavePOST(
      new Request("http://localhost/api/personal-team/leave", {
        method: "POST",
        headers: { ...authHeader(member), "Content-Type": "application/json" },
        body: JSON.stringify({ team_owner_user_id: teamOwner }),
      })
    );
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { already_left?: boolean };
    expect(j1.already_left).not.toBe(true);

    const r2 = await leavePOST(
      new Request("http://localhost/api/personal-team/leave", {
        method: "POST",
        headers: { ...authHeader(member), "Content-Type": "application/json" },
        body: JSON.stringify({ team_owner_user_id: teamOwner }),
      })
    );
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as { already_left?: boolean };
    expect(j2.already_left).toBe(true);
  });
});

describe("POST /api/personal-team/remove idempotent", () => {
  it("returns already_removed when seat already removed", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.removeAdmin, videoTeamProfile());
    db.seedDoc("profiles", U.removeMember, videoTeamProfile());
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.removeAdmin, {
      team_id: U.removeAdmin,
      owner_user_id: U.removeAdmin,
      status: "active",
    });
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(U.removeAdmin, U.removeMember),
      {
        team_owner_user_id: U.removeAdmin,
        member_user_id: U.removeMember,
        seat_access_level: "none",
        status: "removed",
      }
    );

    const res = await removePOST(
      new Request("http://localhost/api/personal-team/remove", {
        method: "POST",
        headers: { ...authHeader(U.removeAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({ member_user_id: U.removeMember }),
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean; already_removed?: boolean };
    expect(j.ok).toBe(true);
    expect(j.already_removed).toBe(true);
  });

  it("first remove sets removed; second call is idempotent", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.removeAdmin, videoTeamProfile());
    db.seedDoc("profiles", U.removeMember, videoTeamProfile());
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.removeAdmin, {
      team_id: U.removeAdmin,
      owner_user_id: U.removeAdmin,
      status: "active",
    });
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(U.removeAdmin, U.removeMember),
      {
        team_owner_user_id: U.removeAdmin,
        member_user_id: U.removeMember,
        seat_access_level: "none",
        status: "active",
      }
    );

    const r1 = await removePOST(
      new Request("http://localhost/api/personal-team/remove", {
        method: "POST",
        headers: { ...authHeader(U.removeAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({ member_user_id: U.removeMember }),
      })
    );
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { already_removed?: boolean };
    expect(j1.already_removed).not.toBe(true);

    const r2 = await removePOST(
      new Request("http://localhost/api/personal-team/remove", {
        method: "POST",
        headers: { ...authHeader(U.removeAdmin), "Content-Type": "application/json" },
        body: JSON.stringify({ member_user_id: U.removeMember }),
      })
    );
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as { already_removed?: boolean };
    expect(j2.already_removed).toBe(true);
  });
});

describe("GET /api/account/workspaces — owned + multiple memberships", () => {
  it("lists owned team row and each member team with membershipKind", async () => {
    const db = testHarness.db!;
    db.seedDoc("profiles", U.combo, videoTeamProfile({ display_name: "Combo" }));
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, U.combo, {
      team_id: U.combo,
      owner_user_id: U.combo,
      status: "active",
    });
    for (const o of [U.ownerA, U.ownerB]) {
      db.seedDoc("profiles", o, videoTeamProfile({ display_name: `Host ${o}` }));
      db.seedDoc(PERSONAL_TEAMS_COLLECTION, o, {
        team_id: o,
        owner_user_id: o,
        status: "active",
      });
      db.seedDoc(PERSONAL_TEAM_SETTINGS_COLLECTION, o, { team_name: `Named team ${o}` });
      db.seedDoc(
        PERSONAL_TEAM_SEATS_COLLECTION,
        personalTeamSeatDocId(o, U.combo),
        {
          team_owner_user_id: o,
          member_user_id: U.combo,
          seat_access_level: o === U.ownerA ? "fullframe" : "none",
          status: "active",
          invited_email: `${U.combo}@test.local`,
        }
      );
    }

    const res = await workspacesGET(
      new Request("http://localhost/api/account/workspaces", {
        headers: authHeader(U.combo),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personalTeams: Array<{ ownerUserId: string; membershipKind: string; role: string }>;
      personal: { id: string } | null;
      workspace_rollout: unknown;
    };
    expect(body.personal).not.toBeNull();
    expect(body.personalTeams).toHaveLength(3);

    const owned = body.personalTeams.filter((t) => t.membershipKind === "owned");
    const members = body.personalTeams.filter((t) => t.membershipKind === "member");
    expect(owned).toHaveLength(1);
    expect(owned[0]?.ownerUserId).toBe(U.combo);
    expect(members).toHaveLength(2);
    const ff = members.find((m) => m.ownerUserId === U.ownerA);
    const base = members.find((m) => m.ownerUserId === U.ownerB);
    expect(ff?.role).toBe("Bizzi Full Frame");
    expect(base?.role).toBe("Member");
    expect(body.workspace_rollout).toBeNull();
  });

  it("includes owned team in switcher when shell exists but owner has zero extra seats (setup mode)", async () => {
    const db = testHarness.db!;
    const ownerOnly = "uid_ws_owner_no_seats";
    db.seedDoc("profiles", ownerOnly, {
      plan_id: "video",
      display_name: "Sans Seats",
      team_seat_counts: { none: 0, gallery: 0, editor: 0, fullframe: 0 },
      storage_lifecycle_status: "active",
      billing_status: "active",
      personal_status: "active",
    });
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, ownerOnly, {
      team_id: ownerOnly,
      owner_user_id: ownerOnly,
      status: "active",
    });
    db.seedDoc(PERSONAL_TEAM_SETTINGS_COLLECTION, ownerOnly, { team_name: "Identity Only FC" });

    const res = await workspacesGET(
      new Request("http://localhost/api/account/workspaces", {
        headers: authHeader(ownerOnly),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personalTeams: Array<{ membershipKind?: string; ownerUserId: string }>;
      personal: unknown;
      team_setup_mode?: boolean;
    };
    expect(body.personal).not.toBeNull();
    const owned = body.personalTeams.filter((t) => t.membershipKind === "owned");
    expect(owned).toHaveLength(1);
    expect(owned[0]?.ownerUserId).toBe(ownerOnly);
    expect(body.team_setup_mode).toBe(true);
  });

  it("POST ensure-shell then GET workspaces lists owned row (client ordering guard)", async () => {
    const ownerUid = "uid_ensure_shell_then_ws";
    const db = testHarness.db!;
    db.seedDoc("profiles", ownerUid, {
      plan_id: "video",
      display_name: "Intent Owner",
      team_seat_counts: { none: 0, gallery: 0, editor: 0, fullframe: 0 },
      storage_lifecycle_status: "active",
      billing_status: "active",
      personal_status: "active",
    });
    db.seedDoc(PERSONAL_TEAM_SETTINGS_COLLECTION, ownerUid, { team_name: "New Team FC" });

    const wsBefore = await workspacesGET(
      new Request("http://localhost/api/account/workspaces", {
        headers: authHeader(ownerUid),
      })
    );
    expect(wsBefore.status).toBe(200);
    const bodyBefore = (await wsBefore.json()) as {
      personalTeams: Array<{ membershipKind?: string }>;
    };
    expect(bodyBefore.personalTeams.some((t) => t.membershipKind === "owned")).toBe(false);

    const ens = await ensureShellPOST(
      new Request("http://localhost/api/personal-team/ensure-shell", {
        method: "POST",
        headers: authHeader(ownerUid),
      })
    );
    expect(ens.status).toBe(200);
    const ensBody = (await ens.json()) as { team_shell_exists?: boolean; ok?: boolean };
    expect(ensBody.ok).toBe(true);
    expect(ensBody.team_shell_exists).toBe(true);

    const wsAfter = await workspacesGET(
      new Request("http://localhost/api/account/workspaces", {
        headers: authHeader(ownerUid),
      })
    );
    expect(wsAfter.status).toBe(200);
    const bodyAfter = (await wsAfter.json()) as {
      personalTeams: Array<{ membershipKind?: string; ownerUserId: string }>;
    };
    const ownedAfter = bodyAfter.personalTeams.filter((t) => t.membershipKind === "owned");
    expect(ownedAfter).toHaveLength(1);
    expect(ownedAfter[0]?.ownerUserId).toBe(ownerUid);
  });

  it("includes owned team in switcher when owner has at least one extra seat", async () => {
    const db = testHarness.db!;
    const ownerOne = "uid_ws_owner_one_seat";
    db.seedDoc("profiles", ownerOne, {
      plan_id: "video",
      display_name: "One Seat",
      team_seat_counts: { none: 1, gallery: 0, editor: 0, fullframe: 0 },
      storage_lifecycle_status: "active",
      billing_status: "active",
      personal_status: "active",
    });
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, ownerOne, {
      team_id: ownerOne,
      owner_user_id: ownerOne,
      status: "active",
    });
    db.seedDoc(PERSONAL_TEAM_SETTINGS_COLLECTION, ownerOne, { team_name: "Activated FC" });

    const res = await workspacesGET(
      new Request("http://localhost/api/account/workspaces", {
        headers: authHeader(ownerOne),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personalTeams: Array<{ membershipKind?: string; ownerUserId: string }>;
    };
    const owned = body.personalTeams.filter((t) => t.membershipKind === "owned");
    expect(owned).toHaveLength(1);
    expect(owned[0]?.ownerUserId).toBe(ownerOne);
  });
});

describe("GET /api/personal-team/shell-state", () => {
  const shellOwner = "uid_shell_state_owner";
  const activeMember = "uid_shell_state_member_active";
  const removedMember = "uid_shell_state_member_removed";
  const invitedMember = "uid_shell_state_member_invited";
  const coldMember = "uid_shell_state_member_cold";

  beforeEach(() => {
    const db = testHarness.db!;
    db.seedDoc(
      "profiles",
      shellOwner,
      videoTeamProfile({
        team_seat_counts: { none: 1, gallery: 0, editor: 0, fullframe: 0 },
      })
    );
    db.seedDoc(PERSONAL_TEAMS_COLLECTION, shellOwner, {
      team_id: shellOwner,
      owner_user_id: shellOwner,
      status: "active",
    });
    db.seedDoc("profiles", activeMember, videoTeamProfile({ display_name: "Active M" }));
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(shellOwner, activeMember),
      {
        team_owner_user_id: shellOwner,
        member_user_id: activeMember,
        seat_access_level: "none",
        status: "active",
        invited_email: `${activeMember}@test.local`,
      }
    );
    db.seedDoc("profiles", removedMember, videoTeamProfile({ display_name: "Removed M" }));
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(shellOwner, removedMember),
      {
        team_owner_user_id: shellOwner,
        member_user_id: removedMember,
        seat_access_level: "none",
        status: "removed",
        invited_email: `${removedMember}@test.local`,
      }
    );
    db.seedDoc("profiles", invitedMember, videoTeamProfile({ display_name: "Invited M" }));
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(shellOwner, invitedMember),
      {
        team_owner_user_id: shellOwner,
        member_user_id: invitedMember,
        seat_access_level: "none",
        status: "invited",
        invited_email: `${invitedMember}@test.local`,
      }
    );
    db.seedDoc("profiles", coldMember, videoTeamProfile({ display_name: "Cold M" }));
    db.seedDoc(
      PERSONAL_TEAM_SEATS_COLLECTION,
      personalTeamSeatDocId(shellOwner, coldMember),
      {
        team_owner_user_id: shellOwner,
        member_user_id: coldMember,
        seat_access_level: "none",
        status: "cold_storage",
        invited_email: `${coldMember}@test.local`,
      }
    );
  });

  it("returns owner shell flags for an active member who may enter", async () => {
    const res = await shellStateGET(
      new Request(
        `http://localhost/api/personal-team/shell-state?owner_uid=${encodeURIComponent(shellOwner)}`,
        { headers: authHeader(activeMember) }
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      role: string;
      team_shell_exists: boolean;
      team_seats_enabled: boolean;
      team_setup_mode: boolean;
      owner_allowed_into_shell: boolean;
    };
    expect(body.role).toBe("member");
    expect(body.owner_allowed_into_shell).toBe(true);
    expect(body.team_shell_exists).toBe(true);
    expect(body.team_seats_enabled).toBe(true);
    expect(body.team_setup_mode).toBe(false);
  });

  it("returns owner shell flags for cold_storage member (enterable)", async () => {
    const res = await shellStateGET(
      new Request(
        `http://localhost/api/personal-team/shell-state?owner_uid=${encodeURIComponent(shellOwner)}`,
        { headers: authHeader(coldMember) }
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      role: string;
      team_shell_exists: boolean;
      owner_allowed_into_shell: boolean;
    };
    expect(body.role).toBe("member");
    expect(body.owner_allowed_into_shell).toBe(true);
    expect(body.team_shell_exists).toBe(true);
  });

  it("does not expose owner shell flags to removed or invited members", async () => {
    for (const uid of [removedMember, invitedMember]) {
      const res = await shellStateGET(
        new Request(
          `http://localhost/api/personal-team/shell-state?owner_uid=${encodeURIComponent(shellOwner)}`,
          { headers: authHeader(uid) }
        )
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        team_shell_exists: boolean;
        team_seats_enabled: boolean;
        team_setup_mode: boolean;
        owner_allowed_into_shell: boolean;
      };
      expect(body.owner_allowed_into_shell).toBe(false);
      expect(body.team_shell_exists).toBe(false);
      expect(body.team_seats_enabled).toBe(false);
      expect(body.team_setup_mode).toBe(false);
    }
  });
});
