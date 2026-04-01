/**
 * Cron: Permanently delete cold storage files past their expiration date.
 * Deletes B2 objects and cold_storage_files documents.
 * Skips docs with cold_storage_status === "restored".
 * Logs each deletion to audit_logs.
 *
 * Schedule: daily (e.g. 5:45 UTC). Requires CRON_SECRET.
 */
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { sendOrgPurgedEmail, sendTeamPurgedEmail } from "@/lib/emailjs";
import { createNotification, resolveEmailsToUserIds } from "@/lib/notification-service";
import {
  isB2Configured,
  deleteObjectWithRetry,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { writeAuditLog } from "@/lib/audit-log";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 100;
const MAX_PER_RUN = 500;

/** Vercel Cron invokes scheduled routes with GET; manual runs may use POST. */
async function handleCron(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getAdminFirestore();
  const now = Timestamp.now();

  const snap = await db
    .collection("cold_storage_files")
    .where("cold_storage_expires_at", "<=", now)
    .limit(MAX_PER_RUN)
    .get();

  if (snap.empty) {
    return NextResponse.json({
      processed: 0,
      message: "No cold storage files past expiration",
    });
  }

  let deletedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = snap.docs.slice(i, i + BATCH_SIZE);
    for (const doc of batch) {
      const data = doc.data();
      const status = (data.cold_storage_status as string) ?? "active";

      if (status === "restored") {
        skippedCount++;
        continue;
      }

      const objectKey = (data.object_key as string) ?? "";
      const docId = doc.id;
      const ownerType = (data.owner_type as string) ?? "unknown";
      const userId = (data.user_id as string) ?? null;
      const orgId = (data.org_id as string) ?? null;

      if (objectKey && isB2Configured()) {
        try {
          const refsSnap = await db
            .collection("backup_files")
            .where("object_key", "==", objectKey)
            .limit(1)
            .get();
          const coldRefs = await db
            .collection("cold_storage_files")
            .where("object_key", "==", objectKey)
            .get();
          const otherColdRefs = coldRefs.docs.filter((d) => d.id !== docId);
          if (refsSnap.empty && otherColdRefs.length === 0) {
            await deleteObjectWithRetry(objectKey);
            await deleteObjectWithRetry(getProxyObjectKey(objectKey)).catch(() => {});
            await deleteObjectWithRetry(getVideoThumbnailCacheKey(objectKey)).catch(() => {});
          }
        } catch (err) {
          console.error("[cold-storage-cleanup] B2 delete failed:", objectKey, err);
          errorCount++;
        }
      }
      await doc.ref.delete();
      deletedCount++;

      await writeAuditLog({
        action: "cold_storage_deleted",
        metadata: {
          doc_id: docId,
          owner_type: ownerType,
          user_id: userId,
          org_id: orgId,
        },
      });

      const pto = data.personal_team_owner_id as string | undefined;
      if (orgId) {
        const leftOrg = await db
          .collection("cold_storage_files")
          .where("org_id", "==", orgId)
          .limit(1)
          .get();
        if (leftOrg.empty) {
          const snap = await db.collection("cold_storage_org_snapshots").doc(orgId).get();
          const orgNamePurged = (snap.data()?.org_name as string) ?? "Organization";
          const seats = snap.data()?.seats as Array<{ role?: string; email?: string }> | undefined;
          const admin = seats?.find((s) => s.role === "admin");
          const adminEm = (admin?.email ?? "").trim().toLowerCase();
          if (adminEm) {
            sendOrgPurgedEmail({ to_email: adminEm, org_name: orgNamePurged }).catch((err) =>
              console.error("[cold-storage-cleanup] org purged email failed", orgId, err)
            );
            const orgNotifyUids = await resolveEmailsToUserIds([adminEm], undefined);
            if (orgNotifyUids[0]) {
              await createNotification({
                recipientUserId: orgNotifyUids[0],
                actorUserId: orgNotifyUids[0],
                type: "lifecycle_storage_purged",
                allowSelfActor: true,
                metadata: {
                  purgeScope: "org",
                  orgName: orgNamePurged,
                  actorDisplayName: "Bizzi Cloud",
                },
              }).catch((err) =>
                console.error("[cold-storage-cleanup] org purged notify", orgId, err)
              );
            }
          }
        }
      }
      if (pto) {
        const leftTeam = await db
          .collection("cold_storage_files")
          .where("personal_team_owner_id", "==", pto)
          .limit(1)
          .get();
        if (leftTeam.empty) {
          try {
            const r = await getAdminAuth().getUser(pto);
            const em = (r.email ?? "").trim().toLowerCase();
            if (em) {
              sendTeamPurgedEmail({ to_email: em }).catch((err) =>
                console.error("[cold-storage-cleanup] team purged email failed", pto, err)
              );
            }
            await createNotification({
              recipientUserId: pto,
              actorUserId: pto,
              type: "lifecycle_storage_purged",
              allowSelfActor: true,
              metadata: {
                purgeScope: "personal_team",
                actorDisplayName: "Bizzi Cloud",
              },
            }).catch((err) =>
              console.error("[cold-storage-cleanup] team purged notify", pto, err)
            );
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  return NextResponse.json({
    processed: deletedCount,
    skipped: skippedCount,
    errors: errorCount,
    message: `Deleted ${deletedCount} cold storage file(s)`,
  });
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
