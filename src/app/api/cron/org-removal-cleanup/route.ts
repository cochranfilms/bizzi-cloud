/**
 * Cron: Migrate organizations past their removal deadline to cold storage.
 * Runs after the grace period. Uses migrateOrgToColdStorage for file migration.
 * Soft-deletes org (status: cold_storage) for restore capability.
 *
 * Schedule: daily (e.g. 5:30 UTC). Requires CRON_SECRET.
 */
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { migrateOrgToColdStorage } from "@/lib/cold-storage-migrate";
import { transitionToColdStorage } from "@/lib/storage-lifecycle";
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_ORGS_PER_RUN = 5;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getAdminFirestore();
  const now = Timestamp.now();

  const orgsSnap = await db
    .collection("organizations")
    .where("removal_deadline", "<=", now)
    .limit(MAX_ORGS_PER_RUN)
    .get();

  if (orgsSnap.empty) {
    return NextResponse.json({
      processed: 0,
      message: "No organizations past removal deadline",
    });
  }

  const results: { orgId: string; status: string; error?: string; files?: number }[] = [];

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    const orgData = orgDoc.data();

    try {
      // 1. Cancel Stripe subscription
      const stripeSubscriptionId = orgData.stripe_subscription_id as string | undefined;
      if (stripeSubscriptionId) {
        try {
          const stripe = getStripeInstance();
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          if (!sub.cancel_at_period_end && !sub.canceled_at) {
            await stripe.subscriptions.cancel(stripeSubscriptionId);
          }
        } catch (err) {
          console.error("[org-removal-cleanup] Stripe cancel failed for", orgId, err);
        }
      }

      // 2. Build org snapshot (seats, drives, workspaces) before migration deletes them
      const seatsSnap = await db
        .collection("organization_seats")
        .where("organization_id", "==", orgId)
        .get();
      const drivesSnap = await db
        .collection("linked_drives")
        .where("organization_id", "==", orgId)
        .get();
      const workspacesSnap = await db
        .collection("workspaces")
        .where("organization_id", "==", orgId)
        .get();

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

      // 3. Migrate backup_files to cold_storage_files (centralized)
      const { migrated: migratedCount } = await migrateOrgToColdStorage(
        orgId,
        "org_removal"
      );

      // 4. Clear profiles (organization_id, organization_role)
      const profilesSnap = await db
        .collection("profiles")
        .where("organization_id", "==", orgId)
        .get();
      for (const p of profilesSnap.docs) {
        await p.ref.update({
          organization_id: null,
          organization_role: null,
        });
      }

      // 8. Delete organization_seats
      for (const s of seatsSnap.docs) {
        await s.ref.delete();
      }

      // 9. Delete transfers for org
      const transfersSnap = await db
        .collection("transfers")
        .where("organization_id", "==", orgId)
        .get();
      for (const t of transfersSnap.docs) {
        await t.ref.delete();
      }

      // 10. Delete Firebase Storage org logo
      try {
        const storage = getAdminStorage();
        const bucket = storage.bucket();
        const [files] = await bucket.getFiles({ prefix: `organizations/${orgId}/` });
        for (const file of files) {
          await file.delete();
        }
      } catch (err) {
        console.error("[org-removal-cleanup] Storage delete failed for", orgId, err);
      }

      // 11. Transition to cold storage (storage_lifecycle_status, audit)
      await transitionToColdStorage({
        target: "org",
        id: orgId,
        billingStatus: "canceled",
        auditTrigger: "org_removal",
      });

      // 12. Soft-delete org: set status cold_storage, clear removal fields
      await orgDoc.ref.update({
        status: "cold_storage",
        stripe_subscription_id: FieldValue.delete(),
        removal_completed_at: Timestamp.now(),
        removal_requested_at: FieldValue.delete(),
        removal_deadline: FieldValue.delete(),
        removal_requested_by: FieldValue.delete(),
      });

      results.push({ orgId, status: "migrated", files: migratedCount });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[org-removal-cleanup] Failed for org", orgId, err);
      results.push({ orgId, status: "error", error: msg });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
