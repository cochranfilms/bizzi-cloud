/**
 * Cron: Permanently delete profiles and Firebase Auth users
 * where account_deletion_effective_at has passed.
 * When user has active org seats: purge personal workspace only, keep identity.
 * When user has no org seats: full profile + auth deletion.
 * Cold-storage-cleanup cron handles B2 + Firestore file deletion.
 *
 * Schedule: daily. Requires CRON_SECRET.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_PER_RUN = 20;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getAdminFirestore();
  const auth = getAdminAuth();
  const now = Timestamp.now();

  const profilesSnap = await db
    .collection("profiles")
    .where("account_deletion_effective_at", "<=", now)
    .limit(MAX_PER_RUN)
    .get();

  if (profilesSnap.empty) {
    return NextResponse.json({
      processed: 0,
      message: "No profiles past deletion deadline",
    });
  }

  const results: { uid: string; status: string; error?: string }[] = [];

  for (const doc of profilesSnap.docs) {
    const uid = doc.id;
    try {
      const activeSeatsSnap = await db
        .collection("organization_seats")
        .where("user_id", "==", uid)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (!activeSeatsSnap.empty) {
        // User has org seats: purge personal workspace only, keep identity
        await db.collection("profiles").doc(uid).update({
          personal_status: "purged",
          personal_deleted_at: FieldValue.delete(),
          personal_restore_available_until: FieldValue.delete(),
          personal_purge_at: Timestamp.now(),
          account_deletion_requested_at: FieldValue.delete(),
          account_deletion_effective_at: FieldValue.delete(),
          storage_lifecycle_status: "active",
        });
        results.push({ uid, status: "personal_purged" });
      } else {
        const ownedOrgsSnap = await db
          .collection("organizations")
          .where("created_by", "==", uid)
          .limit(1)
          .get();
        if (!ownedOrgsSnap.empty) {
          results.push({
            uid,
            status: "skipped",
            error: "User owns organization; transfer ownership before identity deletion",
          });
          continue;
        }
        // No org seats, does not own org: full deletion
        await db.collection("profiles").doc(uid).delete();
        try {
          await auth.deleteUser(uid);
        } catch (authErr) {
          console.error("[account-deletion-cleanup] Auth delete failed for", uid, authErr);
        }
        results.push({ uid, status: "deleted" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[account-deletion-cleanup] Failed for", uid, err);
      results.push({ uid, status: "error", error: msg });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
