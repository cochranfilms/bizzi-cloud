/**
 * Cron: Migrate organizations past their removal deadline to cold storage.
 * Runs after the grace period. Moves files to cold_storage_files (keeps B2 objects).
 * Soft-deletes org (status: cold_storage) for restore capability.
 *
 * Schedule: daily (e.g. 5:30 UTC). Requires CRON_SECRET.
 */
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { getRetentionDays } from "@/lib/cold-storage-retention";
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

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

      const orgName = (orgData.name as string) ?? "Organization";

      // 2. Build seat mapping: userId -> { email, role }
      const seatsSnap = await db
        .collection("organization_seats")
        .where("organization_id", "==", orgId)
        .get();
      const ownerSeat = seatsSnap.docs.find((d) => d.data().role === "admin");
      const ownerEmail = (ownerSeat?.data()?.email as string)?.trim()?.toLowerCase() ?? "";
      const userIdToEmail = new Map<string, string>();
      const userIdToRole = new Map<string, string>();
      for (const d of seatsSnap.docs) {
        const data = d.data();
        const uid = (data.user_id as string)?.trim();
        const email = (data.email as string)?.trim()?.toLowerCase();
        const role = (data.role as string) ?? "member";
        if (uid && email) {
          userIdToEmail.set(uid, email);
          userIdToRole.set(uid, role);
        }
      }

      // 3. Build drive mapping: driveId -> name
      const drivesSnap = await db
        .collection("linked_drives")
        .where("organization_id", "==", orgId)
        .get();
      const driveIdToName = new Map<string, string>();
      for (const d of drivesSnap.docs) {
        driveIdToName.set(d.id, (d.data().name as string) ?? "Drive");
      }

      // 4. Migrate backup_files to cold_storage_files (do NOT delete B2 objects)
      const retentionDays = getRetentionDays("enterprise", "org_removal");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + retentionDays);

      let filesRemaining = true;
      let migratedCount = 0;
      while (filesRemaining) {
        const filesSnap = await db
          .collection("backup_files")
          .where("organization_id", "==", orgId)
          .limit(BATCH_SIZE)
          .get();

        if (filesSnap.empty) {
          filesRemaining = false;
          break;
        }

        const batch = db.batch();
        for (const fileDoc of filesSnap.docs) {
          const data = fileDoc.data();
          const objectKey = (data.object_key as string) ?? "";
          if (!objectKey) {
            batch.delete(fileDoc.ref);
            continue;
          }

          const fileUserId = (data.userId ?? data.user_id) as string;
          const email = userIdToEmail.get(fileUserId) ?? "";
          const role = userIdToRole.get(fileUserId) ?? "member";
          const driveId = data.linked_drive_id as string;
          const driveName = driveIdToName.get(driveId) ?? "Drive";

          const isOwner = role === "admin" || email === ownerEmail;
          const coldStorageFolder = isOwner
            ? ownerEmail || email
            : `${ownerEmail}/${email}`.replace(/\/+$/, "");

          const coldRef = db.collection("cold_storage_files").doc();
          batch.set(coldRef, {
            org_id: orgId,
            org_name: orgName,
            cold_storage_folder: coldStorageFolder || email,
            owner_email: ownerEmail || email,
            member_email: isOwner ? null : email,
            object_key: objectKey,
            relative_path: (data.relative_path as string) ?? "",
            drive_name: driveName,
            size_bytes: typeof data.size_bytes === "number" ? data.size_bytes : 0,
            user_id: fileUserId,
            linked_drive_id: driveId,
            cold_storage_started_at: Timestamp.now(),
            cold_storage_expires_at: Timestamp.fromDate(expiresAt),
            plan_tier: "enterprise",
            source_type: "org_removal",
            content_type: data.content_type ?? null,
            modified_at: data.modified_at ?? null,
            created_at: data.created_at ?? new Date().toISOString(),
          });
          batch.delete(fileDoc.ref);
          migratedCount++;
        }
        await batch.commit();
      }

      // 5. Delete backup_snapshots for org drives
      const driveIds = drivesSnap.docs.map((d) => d.id);
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

      // 11. Soft-delete org: set status cold_storage, keep stripe_customer_id for restore
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
