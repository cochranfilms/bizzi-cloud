/**
 * Cron: Permanently delete organizations past their removal deadline.
 * Runs after the 14-day grace period. Deletes org data, B2 objects, clears profiles.
 *
 * Schedule: daily (e.g. 5:30 UTC). Requires CRON_SECRET.
 */
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase-admin";
import {
  isB2Configured,
  deleteObjectWithRetry,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { getStripeInstance } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 100;
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

  const results: { orgId: string; status: string; error?: string }[] = [];

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

      // 2. Get backup_files for this org
      const filesSnap = await db
        .collection("backup_files")
        .where("organization_id", "==", orgId)
        .limit(5000) // Process in batches if needed
        .get();

      if (isB2Configured()) {
        for (const fileDoc of filesSnap.docs) {
          const data = fileDoc.data();
          const objectKey = (data?.object_key as string) ?? "";
          if (!objectKey) {
            await fileDoc.ref.delete();
            continue;
          }
          const refsSnap = await db
            .collection("backup_files")
            .where("object_key", "==", objectKey)
            .get();
          const otherRefs = refsSnap.docs.filter((d) => d.id !== fileDoc.id);
          if (otherRefs.length > 0) continue;
          try {
            await deleteObjectWithRetry(objectKey);
            const proxyKey = getProxyObjectKey(objectKey);
            const thumbKey = getVideoThumbnailCacheKey(objectKey);
            await Promise.all([
              deleteObjectWithRetry(proxyKey).catch(() => {}),
              deleteObjectWithRetry(thumbKey).catch(() => {}),
            ]);
          } catch (err) {
            console.error("[org-removal-cleanup] B2 delete failed:", objectKey, err);
          }
          await fileDoc.ref.delete();
        }
      } else {
        for (const fileDoc of filesSnap.docs) {
          await fileDoc.ref.delete();
        }
      }

      // 3. Delete remaining backup_files (if batch was exhausted, run again)
      let filesRemaining = true;
      while (filesRemaining) {
        const more = await db
          .collection("backup_files")
          .where("organization_id", "==", orgId)
          .limit(BATCH_SIZE)
          .get();
        if (more.empty) {
          filesRemaining = false;
          break;
        }
        for (const d of more.docs) {
          const objectKey = (d.data()?.object_key as string) ?? "";
          if (objectKey && isB2Configured()) {
            try {
              await deleteObjectWithRetry(objectKey);
              await deleteObjectWithRetry(getProxyObjectKey(objectKey)).catch(() => {});
              await deleteObjectWithRetry(getVideoThumbnailCacheKey(objectKey)).catch(() => {});
            } catch {
              // Continue
            }
          }
          await d.ref.delete();
        }
      }

      // 4. Get linked_drives for org
      const drivesSnap = await db
        .collection("linked_drives")
        .where("organization_id", "==", orgId)
        .get();
      const driveIds = drivesSnap.docs.map((d) => d.id);

      // 5. Delete backup_snapshots for those drives
      for (const driveId of driveIds) {
        const snapSnap = await db
          .collection("backup_snapshots")
          .where("linked_drive_id", "==", driveId)
          .get();
        for (const s of snapSnap.docs) {
          await s.ref.delete();
        }
      }

      // 6. Delete linked_drives
      for (const d of drivesSnap.docs) {
        await d.ref.delete();
      }

      // 7. Clear profiles (organization_id, organization_role)
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
      const seatsSnap = await db
        .collection("organization_seats")
        .where("organization_id", "==", orgId)
        .get();
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

      // 11. Delete org document
      await orgDoc.ref.delete();

      results.push({ orgId, status: "deleted" });
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
