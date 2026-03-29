/**
 * GET /api/personal-team/close/preview — estimate-only summary for Close Team Workspace (owner only).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { canManagePersonalTeam, ensurePersonalTeamRecord } from "@/lib/personal-team-auth";
import {
  closeWorkspaceReconciliationError,
  getStripeSubscriptionIdFromProfile,
} from "@/lib/personal-team-close-workspace";
import {
  coerceTeamSeatCounts,
  emptyTeamSeatCounts,
  sumExtraTeamSeats,
} from "@/lib/team-seat-pricing";
import { getSubscriptionPreview } from "@/lib/stripe-subscription-preview";
import type { AddonId } from "@/lib/plan-constants";
import { getStripeInstance } from "@/lib/stripe";
import { PERSONAL_TEAM_INVITES_COLLECTION, PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team-constants";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

const VALID_ADDON: AddonId[] = ["gallery", "editor", "fullframe"];
const VALID_STORAGE = [
  "indie_1", "indie_2", "indie_3",
  "video_1", "video_2", "video_3", "video_4", "video_5",
] as const;

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid: ownerUid } = auth;

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(ownerUid).get();
  const profile = profileSnap.data() ?? {};
  await ensurePersonalTeamRecord(db, ownerUid, profile, { allowPlanBootstrap: true });
  if (!(await canManagePersonalTeam(db, ownerUid, ownerUid))) {
    return NextResponse.json({ error: "Only the team owner can close the workspace." }, { status: 403 });
  }

  const purchasedSeats = sumExtraTeamSeats(coerceTeamSeatCounts(profile.team_seat_counts ?? {}));

  const seatsSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .get();
  let assignedSeats = 0;
  for (const d of seatsSnap.docs) {
    const st = (d.data().status as string) ?? "";
    if (st !== "active" && st !== "invited") continue;
    const mid = d.data().member_user_id as string | undefined;
    if (!mid || mid === ownerUid) continue;
    assignedSeats++;
  }

  const pendSnap = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .where("status", "==", "pending")
    .get();
  const pendingInvites = pendSnap.size;

  const billingStatus = (profile.billing_status as string | undefined) ?? "active";
  const recon = closeWorkspaceReconciliationError(profile);

  let currentPeriodEnd: string | null = null;
  const subId = getStripeSubscriptionIdFromProfile(profile);
  if (subId) {
    try {
      const stripe = getStripeInstance();
      const sub = await stripe.subscriptions.retrieve(subId);
      const end = (sub as { current_period_end?: number }).current_period_end;
      if (typeof end === "number") {
        currentPeriodEnd = new Date(end * 1000).toISOString();
      }
    } catch {
      /* ignore */
    }
  }

  const estimateOnly =
    "Preview is informational only. Confirmation re-checks live seats, invites, and billing; the final credit (if any) appears on your billing history per Stripe.";

  if (recon) {
    return NextResponse.json({
      estimate_only: true,
      estimate_only_note: estimateOnly,
      purchased_seats_total: purchasedSeats,
      assigned_seats: assignedSeats,
      pending_invites: pendingInvites,
      current_period_end: currentPeriodEnd,
      billing_status: billingStatus,
      credit_preview: null,
      reconciliation_required: true,
      reconciliation_code: recon.code,
      reconciliation_message: recon.message,
    });
  }

  if (purchasedSeats <= 0 || !subId) {
    return NextResponse.json({
      estimate_only: true,
      estimate_only_note: estimateOnly,
      purchased_seats_total: purchasedSeats,
      assigned_seats: assignedSeats,
      pending_invites: pendingInvites,
      current_period_end: currentPeriodEnd,
      billing_status: billingStatus,
      credit_preview: null,
      no_team_seat_billing: purchasedSeats <= 0,
    });
  }

  let planId = (profile.plan_id as string) ?? "video";
  const rawAddons = profile.addon_ids;
  const addonIds = Array.isArray(rawAddons)
    ? rawAddons.filter((id): id is AddonId => typeof id === "string" && VALID_ADDON.includes(id as AddonId))
    : [];
  const sid = profile.storage_addon_id;
  const storageAddonId =
    typeof sid === "string" && VALID_STORAGE.includes(sid as (typeof VALID_STORAGE)[number]) ? sid : null;

  const previewRes = await getSubscriptionPreview({
    uid: ownerUid,
    planId,
    addonIds,
    storageAddonId,
    teamSeatCounts: emptyTeamSeatCounts(),
  });

  const previewBody = await previewRes.json().catch(() => ({}));
  if (!previewRes.ok) {
    return NextResponse.json({
      estimate_only: true,
      estimate_only_note: estimateOnly,
      purchased_seats_total: purchasedSeats,
      assigned_seats: assignedSeats,
      pending_invites: pendingInvites,
      current_period_end: currentPeriodEnd,
      billing_status: billingStatus,
      credit_preview: null,
      credit_preview_error: (previewBody as { error?: string }).error ?? "Could not load Stripe preview",
    });
  }

  return NextResponse.json({
    estimate_only: true,
    estimate_only_note: estimateOnly,
    purchased_seats_total: purchasedSeats,
    assigned_seats: assignedSeats,
    pending_invites: pendingInvites,
    current_period_end: currentPeriodEnd,
    billing_status: billingStatus,
    credit_preview: previewBody,
  });
}
