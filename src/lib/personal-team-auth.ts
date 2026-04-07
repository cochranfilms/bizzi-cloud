/**
 * Centralized personal-team identity & authorization (server-only).
 * Switcher vs enter vs cap semantics: `personal-team-seat-visibility.ts`.
 */
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/audit-log";
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import { mayInitiatePersonalTeamShell } from "@/lib/personal-team-plan-gates";
import { sumExtraTeamSeats, teamSeatCountsFromProfileDocument } from "@/lib/team-seat-pricing";
import {
  MAX_ACTIVE_NON_OWNED_PERSONAL_TEAM_MEMBERSHIPS,
  PERSONAL_TEAMS_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import {
  seatStatusAllowsEnter,
  seatStatusCountsTowardMembershipCap,
  seatStatusShowsInSwitcher,
} from "@/lib/personal-team-seat-visibility";

export type PersonalTeamRecord = {
  team_id: string;
  owner_user_id: string;
  status: string;
  created_at?: FirebaseFirestore.Timestamp;
};

export {
  seatStatusAllowsEnter,
  seatStatusCountsTowardMembershipCap,
  seatStatusShowsInSwitcher,
} from "@/lib/personal-team-seat-visibility";

export async function getOwnedPersonalTeamDoc(
  db: Firestore,
  uid: string
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const snap = await db.collection(PERSONAL_TEAMS_COLLECTION).doc(uid).get();
  return snap.exists ? snap : null;
}

/** Whether uid owns a personal team per `personal_teams` only (no plan inference). */
export async function userOwnsPersonalTeamRecord(db: Firestore, uid: string): Promise<boolean> {
  const d = await getOwnedPersonalTeamDoc(db, uid);
  return d !== null;
}

export async function getOwnedTeam(
  db: Firestore,
  uid: string
): Promise<{ id: string; data: PersonalTeamRecord } | null> {
  const d = await getOwnedPersonalTeamDoc(db, uid);
  if (!d) return null;
  const data = d.data() as PersonalTeamRecord | undefined;
  if (!data?.owner_user_id) return null;
  return { id: d.id, data };
}

export type EnsurePersonalTeamRecordOptions = {
  /**
   * When true, may create `personal_teams/{ownerUid}` if the profile plan includes team seats,
   * even before a team linked drive or owner-role seat exists.
   *
   * Use only for explicit bootstrap flows (Stripe after billing merge, drive creation, invite
   * administration, admin repair, cold-storage restore). Defaults false so passive reads
   * (profile GET, workspace list, share targets) never materialize owner rows from plan alone.
   */
  allowPlanBootstrap?: boolean;
};

/**
 * Create `personal_teams/{uid}` if missing when there is a **justified** reason:
 * - Team container already exists (`linked_drives` with personal_team_owner_id == owner), or
 * - Owner has issued at least one personal team seat (team_owner_user_id == owner), or
 * - `allowPlanBootstrap` and the subscription plan includes team seats (billing/bootstrap only).
 */
export async function ensurePersonalTeamRecord(
  db: Firestore,
  ownerUid: string,
  profileData?: Record<string, unknown> | undefined,
  options?: EnsurePersonalTeamRecordOptions
): Promise<boolean> {
  const allowPlanBootstrap = options?.allowPlanBootstrap === true;
  const ref = db.collection(PERSONAL_TEAMS_COLLECTION).doc(ownerUid);
  const existing = await ref.get();
  if (existing.exists) return true;

  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", ownerUid)
    .where("personal_team_owner_id", "==", ownerUid)
    .limit(1)
    .get();
  const hasContainer = !drivesSnap.empty;

  const seatsSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .limit(1)
    .get();
  const hasSeatsAsOwner = !seatsSnap.empty;

  const planId = (profileData?.plan_id as string) ?? "free";
  const planEligible =
    !!profileData && planAllowsPersonalTeamSeats(planId);

  const mayBootstrapFromPlan = allowPlanBootstrap && planEligible;
  if (!hasContainer && !hasSeatsAsOwner && !mayBootstrapFromPlan) return false;

  await ref.set(
    {
      team_id: ownerUid,
      owner_user_id: ownerUid,
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

/**
 * If a legacy team linked drive exists but `personal_teams/{ownerUid}` is missing, create the doc.
 * Call from shell-state reads and owner entry checks. Logs audit event when backfill runs.
 */
export async function backfillPersonalTeamDocFromLegacyDrive(
  db: Firestore,
  ownerUid: string
): Promise<boolean> {
  if (await userOwnsPersonalTeamRecord(db, ownerUid)) return false;
  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", ownerUid)
    .where("personal_team_owner_id", "==", ownerUid)
    .limit(1)
    .get();
  if (drivesSnap.empty) return false;
  const ref = db.collection(PERSONAL_TEAMS_COLLECTION).doc(ownerUid);
  await ref.set(
    {
      team_id: ownerUid,
      owner_user_id: ownerUid,
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await writeAuditLog({
    action: "personal_team_shell_backfill_legacy_drive",
    uid: ownerUid,
    metadata: { source: "legacy_team_linked_drive" },
  });
  return true;
}

async function hasPersonalTeamLegacyLinkedDrive(db: Firestore, ownerUid: string): Promise<boolean> {
  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", ownerUid)
    .where("personal_team_owner_id", "==", ownerUid)
    .limit(1)
    .get();
  return !drivesSnap.empty;
}

/**
 * Explicit user intent: create `personal_teams/{ownerUid}` when plan allows team shell/s seats.
 * Use from team route bootstrap, settings, create-drive, etc. — not from passive profile/workspaces GET.
 */
export async function ensurePersonalTeamShellOnUserIntent(
  db: Firestore,
  ownerUid: string,
  profileData?: Record<string, unknown> | undefined
): Promise<boolean> {
  const ref = db.collection(PERSONAL_TEAMS_COLLECTION).doc(ownerUid);
  if ((await ref.get()).exists) return true;
  const planId = (profileData?.plan_id as string) ?? "free";
  if (!mayInitiatePersonalTeamShell(planId)) return false;
  await ref.set(
    {
      team_id: ownerUid,
      owner_user_id: ownerUid,
      status: "active",
      created_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await writeAuditLog({
    action: "personal_team_shell_intent_bootstrap",
    uid: ownerUid,
    metadata: { plan_id: planId },
  });
  return true;
}

export type OwnedPersonalTeamShellServerState = {
  /** `personal_teams/{ownerUid}` exists (after legacy backfill). */
  team_shell_exists: boolean;
  /** Purchased extra seats (`team_seat_counts` sum > 0). */
  team_seats_enabled: boolean;
  /** Owner UX: shell without purchased seats. */
  team_setup_mode: boolean;
  /**
   * Phase 1: may enter `/team/{uid}` as owner when shell doc exists OR legacy team drive exists
   * (drive-only users until backfill completes).
   */
  owner_allowed_into_shell: boolean;
};

/**
 * Single server source for owned-team shell flags. Always runs legacy drive backfill first.
 */
export async function getOwnedPersonalTeamShellState(
  db: Firestore,
  ownerUid: string
): Promise<OwnedPersonalTeamShellServerState> {
  await backfillPersonalTeamDocFromLegacyDrive(db, ownerUid);
  const team_shell_exists = await userOwnsPersonalTeamRecord(db, ownerUid);
  const team_seats_enabled = await ownerPersonalTeamWorkspaceActivated(db, ownerUid);
  const team_setup_mode = team_shell_exists && !team_seats_enabled;
  let owner_allowed_into_shell = team_shell_exists;
  if (!owner_allowed_into_shell) {
    owner_allowed_into_shell = await hasPersonalTeamLegacyLinkedDrive(db, ownerUid);
  }
  return {
    team_shell_exists,
    team_seats_enabled,
    team_setup_mode,
    owner_allowed_into_shell,
  };
}

/** Collaboration features (invites, seat assignment) require purchased team seats. */
export async function ownerTeamSeatsEnabled(db: Firestore, ownerUid: string): Promise<boolean> {
  return ownerPersonalTeamWorkspaceActivated(db, ownerUid);
}

/** True iff uid is the canonical owner of the team at ownerUid (record must exist). */
export async function canManagePersonalTeam(
  db: Firestore,
  uid: string,
  ownerUid: string
): Promise<boolean> {
  if (uid !== ownerUid) return false;
  return userOwnsPersonalTeamRecord(db, uid);
}

/**
 * True when the owner has purchased at least one extra personal-team seat (`profiles.team_seat_counts`).
 * Used for billing/entitlements (e.g. invite limits), **not** for opening the team workspace shell.
 */
export async function ownerPersonalTeamWorkspaceActivated(
  db: Firestore,
  ownerUid: string
): Promise<boolean> {
  const snap = await db.collection("profiles").doc(ownerUid).get();
  const counts = teamSeatCountsFromProfileDocument(
    snap.data() as Record<string, unknown> | undefined
  );
  return sumExtraTeamSeats(counts) > 0;
}

/**
 * Owner may open `/team/{uid}` when `personal_teams/{uid}` exists or a team linked drive is
 * already materialized for them. Extra purchased seats are **not** required to load the shell
 * (billing gates invites/capacity elsewhere).
 */
export async function ownerHasPersonalTeamShell(db: Firestore, ownerUid: string): Promise<boolean> {
  if (await userOwnsPersonalTeamRecord(db, ownerUid)) return true;
  return hasPersonalTeamLegacyLinkedDrive(db, ownerUid);
}

/**
 * Whether `uid` may **resolve into** team workspace `ownerUid` for routing / identity (enter
 * team shell). This is not a full entitlements check.
 *
 * - **Owner (`uid === ownerUid`):** Allowed when {@link ownerHasPersonalTeamShell} is true.
 *   Downstream APIs must still enforce operational permissions (uploads, invites, quota).
 * - **Member:** Allowed when their seat document exists and status allows enter (e.g. active
 *   or cold_storage per `seatStatusAllowsEnter`).
 */
export async function canEnterPersonalTeam(
  db: Firestore,
  uid: string,
  ownerUid: string
): Promise<boolean> {
  if (uid === ownerUid) {
    await backfillPersonalTeamDocFromLegacyDrive(db, uid);
    if (await userOwnsPersonalTeamRecord(db, uid)) return true;
    return hasPersonalTeamLegacyLinkedDrive(db, uid);
  }
  const seatId = personalTeamSeatDocId(ownerUid, uid);
  const seat = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(seatId).get();
  if (!seat.exists) return false;
  const st = seat.data()?.status as string | undefined;
  return seatStatusAllowsEnter(st);
}

export type NonOwnedSeatRow = {
  owner_user_id: string;
  seat_access_level: string;
  status: string;
};

/** All seat docs where user is a member of someone else's team (any status). */
async function listNonOwnedSeatDocs(db: Firestore, uid: string) {
  const snap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("member_user_id", "==", uid)
    .get();
  return snap.docs.filter((d) => {
    const o = d.data().team_owner_user_id as string | undefined;
    return o && o !== uid;
  });
}

/** Distinct other-team owner ids with active membership (cap enforcement). */
export async function getActiveNonOwnedTeamOwnerIds(db: Firestore, uid: string): Promise<string[]> {
  const docs = await listNonOwnedSeatDocs(db, uid);
  const owners = new Set<string>();
  for (const d of docs) {
    const st = d.data().status as string | undefined;
    if (!seatStatusCountsTowardMembershipCap(st)) continue;
    const o = d.data().team_owner_user_id as string;
    if (o && o !== uid) owners.add(o);
  }
  return [...owners];
}

export async function countActiveNonOwnedMemberships(db: Firestore, uid: string): Promise<number> {
  const ids = await getActiveNonOwnedTeamOwnerIds(db, uid);
  return ids.length;
}

/**
 * True if adding membership on `newOwnerUid` exceeds cap.
 * If user already has active seat on newOwnerUid, not over cap.
 */
export async function wouldExceedNonOwnedTeamCap(
  db: Firestore,
  uid: string,
  newOwnerUid: string
): Promise<boolean> {
  if (newOwnerUid === uid) return false;
  const activeOwners = await getActiveNonOwnedTeamOwnerIds(db, uid);
  if (activeOwners.includes(newOwnerUid)) return false;
  return activeOwners.length >= MAX_ACTIVE_NON_OWNED_PERSONAL_TEAM_MEMBERSHIPS;
}

/** Owners of teams the user may enter (own team + seat enter semantics). */
export async function getAccessiblePersonalTeamOwnerIds(db: Firestore, uid: string): Promise<string[]> {
  const out: string[] = [];
  if (await ownerHasPersonalTeamShell(db, uid)) {
    out.push(uid);
  }
  const docs = await listNonOwnedSeatDocs(db, uid);
  for (const d of docs) {
    const o = d.data().team_owner_user_id as string;
    const st = d.data().status as string | undefined;
    if (o && o !== uid && seatStatusAllowsEnter(st) && !out.includes(o)) out.push(o);
  }
  return out;
}

export type SwitcherTeamMemberRow = {
  owner_user_id: string;
  seat_access_level: string;
  status: string;
};

/** Membership rows for workspace switcher (see `seatStatusShowsInSwitcher`). */
export async function getSwitcherNonOwnedPersonalTeams(
  db: Firestore,
  uid: string
): Promise<SwitcherTeamMemberRow[]> {
  const docs = await listNonOwnedSeatDocs(db, uid);
  const rows: SwitcherTeamMemberRow[] = [];
  for (const d of docs) {
    const data = d.data();
    const o = data.team_owner_user_id as string;
    const st = data.status as string | undefined;
    if (!o || o === uid || !seatStatusShowsInSwitcher(st)) continue;
    rows.push({
      owner_user_id: o,
      seat_access_level: (data.seat_access_level as string) ?? "none",
      status: st ?? "active",
    });
  }
  return rows;
}

export type IdentityConflictCode =
  | "stale_profile_member_fields"
  | "cap_exceeded_active_seats"
  | "owned_team_missing_record_but_materialized";

/** Seat memberships for API profile / clients (non-owned; switcher-visible statuses). */
export async function getPersonalTeamSeatMembershipsForProfile(
  db: Firestore,
  uid: string
): Promise<Array<{ owner_user_id: string; seat_access_level: string; status: string }>> {
  const docs = await listNonOwnedSeatDocs(db, uid);
  const out: Array<{ owner_user_id: string; seat_access_level: string; status: string }> = [];
  for (const d of docs) {
    const data = d.data();
    const o = data.team_owner_user_id as string;
    const st = data.status as string | undefined;
    if (!o || o === uid || !seatStatusShowsInSwitcher(st)) continue;
    out.push({
      owner_user_id: o,
      seat_access_level: (data.seat_access_level as string) ?? "none",
      status: st ?? "active",
    });
  }
  return out;
}

export type IdentitySanityResult = {
  warnings: Array<{ code: IdentityConflictCode; detail: string }>;
};

export async function resolvePersonalTeamIdentityConflicts(
  db: Firestore,
  uid: string,
  profileData: Record<string, unknown> | undefined
): Promise<IdentitySanityResult> {
  const warnings: IdentitySanityResult["warnings"] = [];
  const pto = profileData?.personal_team_owner_id as string | undefined;
  const trimmedPto = (pto ?? "").trim();
  if (trimmedPto) {
    const seatId = personalTeamSeatDocId(trimmedPto, uid);
    const seat = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(seatId).get();
    const ok =
      seat.exists &&
      seatStatusCountsTowardMembershipCap(seat.data()?.status as string | undefined);
    if (!ok) {
      warnings.push({
        code: "stale_profile_member_fields",
        detail: "profile.personal_team_owner_id without matching active seat",
      });
    }
  }

  const activeNonOwned = await countActiveNonOwnedMemberships(db, uid);
  if (activeNonOwned > MAX_ACTIVE_NON_OWNED_PERSONAL_TEAM_MEMBERSHIPS) {
    warnings.push({
      code: "cap_exceeded_active_seats",
      detail: `active_non_owned=${activeNonOwned}`,
    });
  }

  const hasMaterial =
    !(await db
      .collection("linked_drives")
      .where("userId", "==", uid)
      .where("personal_team_owner_id", "==", uid)
      .limit(1)
      .get()).empty ||
    !(await db
      .collection(PERSONAL_TEAM_SEATS_COLLECTION)
      .where("team_owner_user_id", "==", uid)
      .limit(1)
      .get()).empty;

  if (hasMaterial && !(await userOwnsPersonalTeamRecord(db, uid))) {
    warnings.push({
      code: "owned_team_missing_record_but_materialized",
      detail: "drives or seats-as-owner exist but personal_teams row missing",
    });
  }

  return { warnings };
}
