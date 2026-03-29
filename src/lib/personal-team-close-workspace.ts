/**
 * Owner-only personal team workspace shutdown (Close Team Workspace).
 * Transactional claim + resumable shutdown_stage; not account deletion or per-seat remove.
 */
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { finalizePersonalTeamColdStorage } from "@/lib/personal-team-container-finalize";
import {
  PERSONAL_TEAMS_COLLECTION,
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
} from "@/lib/personal-team-constants";
import { countUsedSeatsForTier } from "@/lib/personal-team";
import {
  coerceTeamSeatCounts,
  emptyTeamSeatCounts,
  sumExtraTeamSeats,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";
import { PERSONAL_TEAM_SEAT_ACCESS_LEVELS } from "@/lib/team-seat-pricing";
import type { AddonId, BillingCycle } from "@/lib/plan-constants";
import { updateSubscriptionWithProration } from "@/lib/stripe-update-subscription";
import { createNotification, getActorDisplayName } from "@/lib/notification-service";
import { writeAuditLog } from "@/lib/audit-log";
import { suggestIdentityDeletionAfterTeamScopeRemoved } from "@/lib/identity-scope";

export const CLOSE_SHUTDOWN_STAGES = [
  "claimed",
  "access_revoked",
  "stripe_updated",
  "finalized",
  "cleaned",
] as const;

export type PersonalTeamCloseShutdownStage = (typeof CLOSE_SHUTDOWN_STAGES)[number];

const VALID_PLAN_FOR_STRIPE = new Set(["solo", "indie", "video", "production"]);
const VALID_ADDON_IDS: AddonId[] = ["gallery", "editor", "fullframe"];
const VALID_STORAGE_ADDON_IDS = [
  "indie_1", "indie_2", "indie_3",
  "video_1", "video_2", "video_3", "video_4", "video_5",
] as const;

export type PersonalTeamShutdownSnapshot = {
  team_name: string | null;
  logo_url: string | null;
};

export function getStripeSubscriptionIdFromProfile(profile: Record<string, unknown> | undefined): string | null {
  if (!profile) return null;
  const rawSub = profile.stripe_subscription_id;
  if (typeof rawSub === "string" && rawSub.trim()) return rawSub.trim();
  const id = (rawSub as { id?: string } | null)?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function subscriptionHasBillableTeamSeatItems(subscription: Stripe.Subscription): boolean {
  for (const item of subscription.items.data) {
    if (item.deleted) continue;
    const meta = item.price?.metadata;
    if (!meta) continue;
    const isTeam =
      Boolean(meta.personal_team_seat_access) ||
      meta.type === "personal_team_seat" ||
      meta.type === "seat";
    if (isTeam && (item.quantity ?? 0) > 0) return true;
  }
  return false;
}

export async function isPersonalTeamFullyClosed(
  db: Firestore,
  ownerUid: string
): Promise<boolean> {
  const profileSnap = await db.collection("profiles").doc(ownerUid).get();
  const pdata = profileSnap.data();
  if ((pdata?.team_storage_lifecycle_status as string | undefined) !== "cold_storage") {
    return false;
  }
  const teamSnap = await db.collection(PERSONAL_TEAMS_COLLECTION).doc(ownerUid).get();
  const tdata = teamSnap.data();
  if ((tdata?.status as string | undefined) !== "cold_storage") {
    return false;
  }

  const seatsSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .get();
  for (const d of seatsSnap.docs) {
    const st = (d.data().status as string) ?? "";
    if (st === "active" || st === "invited") return false;
  }

  const invSnap = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .where("status", "==", "pending")
    .get();
  if (!invSnap.empty) return false;

  return true;
}

function teamSeatCountsFromProfile(profile: Record<string, unknown> | undefined) {
  return coerceTeamSeatCounts(profile?.team_seat_counts ?? {});
}

export function closeWorkspaceReconciliationError(
  profile: Record<string, unknown> | undefined
): { code: string; message: string } | null {
  const purchased = sumExtraTeamSeats(teamSeatCountsFromProfile(profile));
  const subId = getStripeSubscriptionIdFromProfile(profile);
  if (purchased > 0 && !subId) {
    return {
      code: "BILLING_RECONCILIATION_REQUIRED",
      message:
        "Your account shows purchased team seats but no active billing subscription. Contact support or reconcile billing before closing the workspace.",
    };
  }
  return null;
}

type ClaimResult =
  | { kind: "claimed_new"; snapshot: PersonalTeamShutdownSnapshot }
  | { kind: "resume"; stage: PersonalTeamCloseShutdownStage; snapshot: PersonalTeamShutdownSnapshot | null };

export async function claimOrResumePersonalTeamClose(
  db: Firestore,
  ownerUid: string
): Promise<ClaimResult> {
  return db.runTransaction(async (tx) => {
    const ref = db.collection(PERSONAL_TEAMS_COLLECTION).doc(ownerUid);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new CloseWorkspaceError("NO_TEAM_RECORD", "Personal team record not found.", 400);
    }
    const data = snap.data() ?? {};
    const pending = data.shutdown_pending === true;
    const stage = data.shutdown_stage as string | undefined;
    const actor = data.shutdown_actor_uid as string | undefined;

    if (pending && actor && actor !== ownerUid) {
      throw new CloseWorkspaceError("CONFLICT", "Another close operation is in progress.", 409);
    }

    if (
      pending &&
      stage &&
      stage !== "cleaned" &&
      (CLOSE_SHUTDOWN_STAGES as readonly string[]).includes(stage)
    ) {
      const shSnap = data.shutdown_snapshot as PersonalTeamShutdownSnapshot | undefined;
      return {
        kind: "resume" as const,
        stage: stage as PersonalTeamCloseShutdownStage,
        snapshot: shSnap ?? null,
      };
    }

    const settingsRef = db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(ownerUid);
    const settingsSnap = await tx.get(settingsRef);
    const s = settingsSnap.data() ?? {};
    const snapshot: PersonalTeamShutdownSnapshot = {
      team_name: typeof s.team_name === "string" ? s.team_name : null,
      logo_url: typeof s.logo_url === "string" ? s.logo_url : null,
    };

    tx.update(ref, {
      shutdown_pending: true,
      shutdown_stage: "claimed",
      shutdown_actor_uid: ownerUid,
      shutdown_started_at: FieldValue.serverTimestamp(),
      shutdown_snapshot: snapshot,
    });

    return { kind: "claimed_new" as const, snapshot };
  });
}

export class CloseWorkspaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "CloseWorkspaceError";
  }
}

async function cancelAllPendingInvites(db: Firestore, ownerUid: string): Promise<number> {
  const snap = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .where("status", "==", "pending")
    .get();
  if (snap.empty) return 0;
  let n = 0;
  const writer = db.bulkWriter();
  for (const d of snap.docs) {
    writer.update(d.ref, {
      status: "cancelled",
      updated_at: FieldValue.serverTimestamp(),
    });
    n++;
  }
  await writer.close();
  return n;
}

async function revokeAllMemberSeats(db: Firestore, ownerUid: string): Promise<string[]> {
  const snap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .get();

  const memberUids: string[] = [];
  const writer = db.bulkWriter();
  for (const d of snap.docs) {
    const st = (d.data().status as string) ?? "";
    if (st !== "active" && st !== "invited") continue;
    const mid = d.data().member_user_id as string | undefined;
    if (!mid || mid === ownerUid) continue;

    writer.update(d.ref, {
      status: "removed",
      removed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    const pref = db.collection("profiles").doc(mid);
    writer.set(
      pref,
      {
        personal_team_owner_id: FieldValue.delete(),
        personal_team_seat_access: FieldValue.delete(),
      },
      { merge: true }
    );
    memberUids.push(mid);
  }
  await writer.close();
  return memberUids;
}

async function assertCapacityZero(ownerUid: string): Promise<void> {
  for (const tier of PERSONAL_TEAM_SEAT_ACCESS_LEVELS) {
    const used = await countUsedSeatsForTier(ownerUid, tier as PersonalTeamSeatAccess);
    if (used > 0) {
      throw new CloseWorkspaceError(
        "CAPACITY_NOT_ZERO",
        "Team still has active members or pending invites. Try again in a moment.",
        409
      );
    }
  }
}

function profileAddonIds(profile: Record<string, unknown> | undefined): AddonId[] {
  const raw = profile?.addon_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is AddonId => typeof id === "string" && VALID_ADDON_IDS.includes(id as AddonId));
}

function profileStorageAddonId(profile: Record<string, unknown> | undefined): string | null {
  const id = profile?.storage_addon_id;
  if (typeof id === "string" && VALID_STORAGE_ADDON_IDS.includes(id as (typeof VALID_STORAGE_ADDON_IDS)[number])) {
    return id;
  }
  return null;
}

async function stripeStepRemoveTeamSeats(ownerUid: string, profile: Record<string, unknown>): Promise<{
  skipped: boolean;
  creditSummary?: string;
}> {
  const purchased = sumExtraTeamSeats(teamSeatCountsFromProfile(profile));

  if (purchased <= 0) {
    await getAdminFirestore()
      .collection("profiles")
      .doc(ownerUid)
      .set({ team_seat_counts: emptyTeamSeatCounts() }, { merge: true });
    return { skipped: true };
  }

  const recon = closeWorkspaceReconciliationError(profile);
  if (recon) {
    throw new CloseWorkspaceError(recon.code, recon.message, 409);
  }

  const billingStatus = profile.billing_status as string | undefined;
  if (billingStatus === "past_due") {
    throw new CloseWorkspaceError(
      "BILLING_PAST_DUE",
      "Resolve past-due billing before closing the team workspace with seat changes.",
      400
    );
  }

  const subId = getStripeSubscriptionIdFromProfile(profile)!;
  const stripe = getStripeInstance();
  const subscription = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    throw new CloseWorkspaceError(
      "STRIPE_PAST_DUE",
      "Subscription is past due. Resolve billing before closing.",
      400
    );
  }

  if (!subscriptionHasBillableTeamSeatItems(subscription)) {
    await getAdminFirestore()
      .collection("profiles")
      .doc(ownerUid)
      .set({ team_seat_counts: emptyTeamSeatCounts() }, { merge: true });
    return {
      skipped: true,
      creditSummary:
        "No team seat line items on the subscription; seat counts were cleared locally. If this looks wrong, contact support.",
    };
  }

  let planId = (profile.plan_id as string) ?? "video";
  if (!VALID_PLAN_FOR_STRIPE.has(planId)) {
    planId = "video";
  }
  const addonIds = profileAddonIds(profile);
  const storageAddonId = profileStorageAddonId(profile);
  const planItem = subscription.items.data.find((it) => {
    if (it.deleted) return false;
    const meta = it.price?.metadata;
    if (meta?.addon_id || meta?.storage_addon_plan) return false;
    if (meta?.personal_team_seat_access || meta?.type === "personal_team_seat" || meta?.type === "seat")
      return false;
    if (meta?.plan_id) return true;
    const interval = it.price?.recurring?.interval;
    return interval === "month" || interval === "year";
  });
  const billing: BillingCycle =
    planItem?.price?.recurring?.interval === "year" ? "annual" : "monthly";

  const res = await updateSubscriptionWithProration({
    uid: ownerUid,
    planId,
    addonIds,
    billing,
    storageAddonId,
    teamSeatCounts: emptyTeamSeatCounts(),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errBody = body as { error?: string; code?: string };
    throw new CloseWorkspaceError(
      errBody.code ?? "STRIPE_UPDATE_FAILED",
      errBody.error ?? "Failed to update subscription for team seat removal.",
      res.status >= 400 && res.status < 600 ? res.status : 502
    );
  }

  await getAdminFirestore()
    .collection("profiles")
    .doc(ownerUid)
    .set({ team_seat_counts: emptyTeamSeatCounts() }, { merge: true });

  const json = body as { receipt?: { amountStatusLine?: string; prorationNote?: string } };
  const creditSummary = json.receipt?.amountStatusLine
    ? `${json.receipt.amountStatusLine}${json.receipt.prorationNote ? ` · ${json.receipt.prorationNote}` : ""}`
    : "Subscription updated; final proration appears on your billing history per Stripe.";

  return { skipped: false, creditSummary };
}

async function updateShutdownStage(
  ownerUid: string,
  stage: PersonalTeamCloseShutdownStage
): Promise<void> {
  await getAdminFirestore()
    .collection(PERSONAL_TEAMS_COLLECTION)
    .doc(ownerUid)
    .set({ shutdown_stage: stage }, { merge: true });
}

export async function clearShutdownClaim(ownerUid: string): Promise<void> {
  await getAdminFirestore()
    .collection(PERSONAL_TEAMS_COLLECTION)
    .doc(ownerUid)
    .set(
      {
        shutdown_pending: false,
        shutdown_stage: FieldValue.delete(),
        shutdown_actor_uid: FieldValue.delete(),
        shutdown_started_at: FieldValue.delete(),
        shutdown_snapshot: FieldValue.delete(),
      },
      { merge: true }
    );
}

async function nullTeamIdentitySettings(ownerUid: string): Promise<void> {
  await getAdminFirestore()
    .collection(PERSONAL_TEAM_SETTINGS_COLLECTION)
    .doc(ownerUid)
    .set(
      {
        team_name: FieldValue.delete(),
        logo_url: FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function loadShutdownSnapshotFromTeam(
  db: Firestore,
  ownerUid: string
): Promise<PersonalTeamShutdownSnapshot | null> {
  const snap = await db.collection(PERSONAL_TEAMS_COLLECTION).doc(ownerUid).get();
  const raw = snap.data()?.shutdown_snapshot as PersonalTeamShutdownSnapshot | undefined;
  return raw ?? null;
}

export type ExecuteClosePersonalTeamWorkspaceResult = {
  ok: true;
  already_closed?: boolean;
  invites_cancelled: number;
  members_revoked: number;
  credit_summary?: string;
  team_display_name_used?: string | null;
};

export async function executePersonalTeamWorkspaceClose(
  ownerUid: string,
  options?: { auditIp?: string | null }
): Promise<ExecuteClosePersonalTeamWorkspaceResult> {
  const db = getAdminFirestore();
  if (await isPersonalTeamFullyClosed(db, ownerUid)) {
    await clearShutdownClaim(ownerUid).catch(() => {});
    return { ok: true, already_closed: true, invites_cancelled: 0, members_revoked: 0 };
  }

  const claim = await claimOrResumePersonalTeamClose(db, ownerUid);
  if (claim.kind === "resume" && claim.stage === "cleaned") {
    await clearShutdownClaim(ownerUid);
    return { ok: true, already_closed: true, invites_cancelled: 0, members_revoked: 0 };
  }

  const persistedSnapshot =
    (await loadShutdownSnapshotFromTeam(db, ownerUid)) ??
    (claim.kind === "claimed_new" ? claim.snapshot : { team_name: null, logo_url: null });
  const teamLabel =
    persistedSnapshot?.team_name?.trim() || "your team workspace";

  let stage: PersonalTeamCloseShutdownStage =
    claim.kind === "resume" ? claim.stage : "claimed";

  let invitesCancelled = 0;
  let membersRevoked = 0;
  let creditSummary: string | undefined;

  if (stage === "claimed") {
    invitesCancelled = await cancelAllPendingInvites(db, ownerUid);
    const revokedMemberUids = await revokeAllMemberSeats(db, ownerUid);
    membersRevoked = revokedMemberUids.length;
    await assertCapacityZero(ownerUid);

    const ownerLabel = await getActorDisplayName(db, ownerUid);
    for (const mid of [...new Set(revokedMemberUids)]) {
      createNotification({
        recipientUserId: mid,
        actorUserId: ownerUid,
        type: "personal_team_workspace_closed_member",
        metadata: {
          actorDisplayName: ownerLabel,
          teamWorkspaceName: teamLabel,
        },
      }).catch(() => {});
    }

    await updateShutdownStage(ownerUid, "access_revoked");
    stage = "access_revoked";
    await writeAuditLog({
      action: "personal_team_close_access_revoked",
      uid: ownerUid,
      ip: options?.auditIp ?? null,
      metadata: { invites_cancelled: invitesCancelled, members_revoked: membersRevoked },
    });
  }

  if (stage === "access_revoked") {
    const freshSnap = await db.collection("profiles").doc(ownerUid).get();
    const freshProfile = freshSnap.data() ?? {};
    const stripeResult = await stripeStepRemoveTeamSeats(ownerUid, freshProfile);
    creditSummary = stripeResult.creditSummary;
    await updateShutdownStage(ownerUid, "stripe_updated");
    stage = "stripe_updated";
  }

  if (stage === "stripe_updated") {
    await finalizePersonalTeamColdStorage({
      teamOwnerUserId: ownerUid,
      sourceType: "team_container_shutdown",
      auditTrigger: "owner_close_team_workspace",
    });
    await updateShutdownStage(ownerUid, "finalized");
    stage = "finalized";
  }

  if (stage === "finalized") {
    await nullTeamIdentitySettings(ownerUid);
    createNotification({
      recipientUserId: ownerUid,
      actorUserId: ownerUid,
      type: "personal_team_workspace_closed_owner",
      allowSelfActor: true,
      metadata: {
        actorDisplayName: "You",
        teamWorkspaceName: teamLabel,
      },
    }).catch(() => {});

    await updateShutdownStage(ownerUid, "cleaned");
    await clearShutdownClaim(ownerUid);
    await writeAuditLog({
      action: "personal_team_close_completed",
      uid: ownerUid,
      ip: options?.auditIp ?? null,
      metadata: { team_workspace_name: teamLabel },
    });
  }

  return {
    ok: true,
    invites_cancelled: invitesCancelled,
    members_revoked: membersRevoked,
    credit_summary: creditSummary,
    team_display_name_used: persistedSnapshot?.team_name ?? null,
  };
}

export async function memberIdentityHintsAfterClose(
  db: Firestore,
  memberUids: string[]
): Promise<Record<string, { suggestIdentityDeletion?: boolean }>> {
  const out: Record<string, { suggestIdentityDeletion?: boolean }> = {};
  for (const mid of memberUids) {
    const p = (await db.collection("profiles").doc(mid).get()).data();
    const s = p?.personal_status as string | undefined;
    const orgId = p?.organization_id as string | undefined;
    const sug = suggestIdentityDeletionAfterTeamScopeRemoved(s, orgId);
    if (sug) out[mid] = { suggestIdentityDeletion: sug };
  }
  return out;
}
