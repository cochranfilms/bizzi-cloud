/**
 * Cron: Migrate profiles/orgs in grace_period to cold storage when grace_period_ends_at has passed.
 * First payment failure enters grace; this runs when grace expires without payment.
 *
 * Schedule: daily. Requires CRON_SECRET.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { hasColdStorage } from "@/lib/cold-storage-restore";
import { migrateConsumerToColdStorage } from "@/lib/cold-storage-migrate";
import { finalizeOrganizationColdStorage } from "@/lib/org-container-finalize";
import { transitionToColdStorage } from "@/lib/storage-lifecycle";
import type { ColdStorageSourceType } from "@/lib/cold-storage-retention";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_PER_RUN = 20;

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

  const profilesSnap = await db
    .collection("profiles")
    .where("storage_lifecycle_status", "==", "grace_period")
    .where("grace_period_ends_at", "<=", now)
    .limit(MAX_PER_RUN)
    .get();

  const orgsSnap = await db
    .collection("organizations")
    .where("storage_lifecycle_status", "==", "grace_period")
    .where("grace_period_ends_at", "<=", now)
    .limit(MAX_PER_RUN)
    .get();

  const results: { type: string; id: string; status: string; error?: string }[] = [];

  for (const doc of profilesSnap.docs) {
    const userId = doc.id;
    const profileData = doc.data();
    const planTier = (profileData.plan_id ?? "solo") as string;

    try {
      if (await hasColdStorage({ userId })) {
        await transitionToColdStorage({
          target: "profile",
          id: userId,
          billingStatus: "past_due",
          auditTrigger: "grace_period_expired",
        });
        results.push({ type: "profile", id: userId, status: "already_migrated" });
        continue;
      }

      const result = await migrateConsumerToColdStorage(
        userId,
        "payment_failed" as ColdStorageSourceType,
        planTier
      );
      await transitionToColdStorage({
        target: "profile",
        id: userId,
        billingStatus: "past_due",
        auditTrigger: "grace_period_expired",
      });
      results.push({
        type: "profile",
        id: userId,
        status: "migrated",
        error: result.migrated > 0 ? undefined : "no_files",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[grace-period-expiry] Failed for profile", userId, err);
      results.push({ type: "profile", id: userId, status: "error", error: msg });
    }
  }

  for (const doc of orgsSnap.docs) {
    const orgId = doc.id;

    try {
      const result = await finalizeOrganizationColdStorage({
        orgId,
        sourceType: "payment_failed" as ColdStorageSourceType,
        auditTrigger: "grace_period_expired",
        lifecycleBilling: "past_due",
        cancelStripeWhenPossible: true,
        isAdminRemoval: false,
      });
      results.push({
        type: "org",
        id: orgId,
        status: result.skipped ? "skipped" : "migrated",
        error:
          result.skipped && result.message === "already_finalized"
            ? undefined
            : !result.skipped && result.migrated === 0
              ? "no_files"
              : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[grace-period-expiry] Failed for org", orgId, err);
      results.push({ type: "org", id: orgId, status: "error", error: msg });
    }
  }

  return NextResponse.json({
    processed: results.length,
    profiles: profilesSnap.size,
    orgs: orgsSnap.size,
    results,
  });
}
