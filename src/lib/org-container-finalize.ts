/**
 * Single finalization path when an organization moves to cold storage:
 * snapshot (when seats exist), migrate hot files, clear profile bindings, remove seats,
 * cleanup transfers and branding, lifecycle transition, org status.
 *
 * Used by org-removal-cleanup cron, Stripe subscription.deleted, and grace-period org expiry.
 */
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { migrateOrgToColdStorage } from "@/lib/cold-storage-migrate";
import { transitionToColdStorage } from "@/lib/storage-lifecycle";
import type { ColdStorageSourceType } from "@/lib/cold-storage-retention";
import { getRetentionDays } from "@/lib/cold-storage-retention";
import { getStorageBytesForPlan } from "@/lib/plan-constants";
import { sendOrgRecoveryStorageEmail } from "@/lib/emailjs";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export interface FinalizeOrganizationColdStorageParams {
  orgId: string;
  sourceType: ColdStorageSourceType;
  /** Logged on org lifecycle transition */
  auditTrigger: string;
  /** Past-due grace expiry vs subscription canceled / admin removal */
  lifecycleBilling: "canceled" | "past_due";
  /** Cancel Stripe subscription if still present (org-removal cron) */
  cancelStripeWhenPossible?: boolean;
  /** Admin removal flow: set removal_completed_at and clear removal_* fields */
  isAdminRemoval?: boolean;
}

export interface FinalizeOrganizationColdStorageResult {
  orgId: string;
  skipped: boolean;
  migrated: number;
  message?: string;
}

export async function finalizeOrganizationColdStorage(
  params: FinalizeOrganizationColdStorageParams
): Promise<FinalizeOrganizationColdStorageResult> {
  const {
    orgId,
    sourceType,
    auditTrigger,
    lifecycleBilling,
    cancelStripeWhenPossible,
    isAdminRemoval,
  } = params;

  const db = getAdminFirestore();
  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  const orgData = orgSnap.data();

  if (!orgSnap.exists || !orgData) {
    return { orgId, skipped: true, migrated: 0, message: "org_not_found" };
  }

  const orgStatus = orgData.status as string | undefined;
  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();
  const profilesSnap = await db
    .collection("profiles")
    .where("organization_id", "==", orgId)
    .get();

  const alreadyCold = orgStatus === "cold_storage";
  const noSeats = seatsSnap.empty;
  const noProfileBindings = profilesSnap.empty;

  if (alreadyCold && noSeats && noProfileBindings) {
    return { orgId, skipped: true, migrated: 0, message: "already_finalized" };
  }

  if (cancelStripeWhenPossible) {
    const stripeSubscriptionId = orgData.stripe_subscription_id as string | undefined;
    if (stripeSubscriptionId) {
      try {
        const stripe = getStripeInstance();
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (!sub.cancel_at_period_end && !sub.canceled_at) {
          await stripe.subscriptions.cancel(stripeSubscriptionId);
        }
      } catch (err) {
        console.error("[finalizeOrganizationColdStorage] Stripe cancel failed", orgId, err);
      }
    }
  }

  const drivesSnap = await db
    .collection("linked_drives")
    .where("organization_id", "==", orgId)
    .get();
  const workspacesSnap = await db
    .collection("workspaces")
    .where("organization_id", "==", orgId)
    .get();

  if (!seatsSnap.empty) {
    const orgName = (orgData.name as string) ?? "Organization";
    const snapshotData = {
      org_id: orgId,
      org_name: orgName,
      created_at: Timestamp.now(),
      seats: seatsSnap.docs.map((d) => {
        const data = d.data();
        return {
          user_id: data.user_id,
          email: data.email,
          role: data.role,
        };
      }),
      drives: drivesSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          userId: data.userId ?? data.user_id,
        };
      }),
      workspaces: workspacesSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          organization_id: data.organization_id,
          drive_id: data.drive_id,
          drive_type: data.drive_type ?? null,
          name: data.name,
          workspace_type: data.workspace_type,
          created_by: data.created_by,
          member_user_ids: data.member_user_ids ?? [],
          team_id: data.team_id ?? null,
          project_id: data.project_id ?? null,
          gallery_id: data.gallery_id ?? null,
          is_system_workspace: data.is_system_workspace ?? false,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }),
    };
    await db.collection("cold_storage_org_snapshots").doc(orgId).set(snapshotData);
  }

  let migrated = 0;
  try {
    const { migrated: m } = await migrateOrgToColdStorage(orgId, sourceType);
    migrated = m;
  } catch (err) {
    console.error("[finalizeOrganizationColdStorage] migrate failed", orgId, err);
    throw err;
  }

  const profilesAgain = await db
    .collection("profiles")
    .where("organization_id", "==", orgId)
    .get();
  for (const p of profilesAgain.docs) {
    await p.ref.update({
      organization_id: null,
      organization_role: null,
    });
  }

  const seatsAgain = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();
  for (const s of seatsAgain.docs) {
    await s.ref.delete();
  }

  const transfersSnap = await db
    .collection("transfers")
    .where("organization_id", "==", orgId)
    .get();
  for (const t of transfersSnap.docs) {
    await t.ref.delete();
  }

  try {
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const [files] = await bucket.getFiles({ prefix: `organizations/${orgId}/` });
    for (const file of files) {
      await file.delete();
    }
  } catch (err) {
    console.error("[finalizeOrganizationColdStorage] Storage delete failed", orgId, err);
  }

  await transitionToColdStorage({
    target: "org",
    id: orgId,
    billingStatus: lifecycleBilling,
    auditTrigger,
  });

  const orgUpdate: Record<string, unknown> = {
    status: "cold_storage",
    plan_id: "free",
    storage_quota_bytes: getStorageBytesForPlan("free"),
    stripe_subscription_id: FieldValue.delete(),
  };

  if (isAdminRemoval) {
    orgUpdate.removal_completed_at = Timestamp.now();
    orgUpdate.removal_requested_at = FieldValue.delete();
    orgUpdate.removal_deadline = FieldValue.delete();
    orgUpdate.removal_requested_by = FieldValue.delete();
  }

  await orgRef.set(orgUpdate, { merge: true });

  const adminSeat = seatsSnap.docs.find((d) => (d.data().role as string) === "admin");
  const notifyOwnerEmail = ((adminSeat?.data()?.email as string) ?? "").trim().toLowerCase();
  if (notifyOwnerEmail) {
    const retDays = getRetentionDays("enterprise", sourceType);
    const exp = new Date();
    exp.setDate(exp.getDate() + retDays);
    const expiresStr = exp.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (typeof process.env.VERCEL_URL === "string"
        ? `https://${process.env.VERCEL_URL}`
        : null) ??
      "https://www.bizzicloud.io";
    const orgNameForEmail = (orgData.name as string) ?? "Organization";
    sendOrgRecoveryStorageEmail({
      to_email: notifyOwnerEmail,
      org_name: orgNameForEmail,
      expires_date: expiresStr,
      support_url: `${baseUrl}/support`,
    }).catch((err) =>
      console.error("[finalizeOrganizationColdStorage] recovery email failed", orgId, err)
    );
  }

  return { orgId, skipped: false, migrated };
}
