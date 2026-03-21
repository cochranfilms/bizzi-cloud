/**
 * Cron: Permanently delete profiles and Firebase Auth users
 * where account_deletion_effective_at has passed.
 * Runs after the 30-day retention. Cold-storage-cleanup cron handles B2 + Firestore file deletion.
 *
 * Schedule: daily. Requires CRON_SECRET.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
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
      await db.collection("profiles").doc(uid).delete();
      try {
        await auth.deleteUser(uid);
      } catch (authErr) {
        console.error("[account-deletion-cleanup] Auth delete failed for", uid, authErr);
        // Profile already deleted; auth may not exist
      }
      results.push({ uid, status: "deleted" });
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
