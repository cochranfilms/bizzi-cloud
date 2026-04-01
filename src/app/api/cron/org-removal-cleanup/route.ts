/**
 * Cron: Migrate organizations past their removal deadline to cold storage.
 * Runs after the grace period. Delegates to finalizeOrganizationColdStorage.
 *
 * Schedule: daily (e.g. 5:30 UTC). Requires CRON_SECRET.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { finalizeOrganizationColdStorage } from "@/lib/org-container-finalize";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_ORGS_PER_RUN = 5;

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

  const results: {
    orgId: string;
    status: string;
    error?: string;
    files?: number;
    skipped?: boolean;
  }[] = [];

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;

    try {
      const result = await finalizeOrganizationColdStorage({
        orgId,
        sourceType: "org_removal",
        auditTrigger: "org_removal",
        lifecycleBilling: "canceled",
        cancelStripeWhenPossible: true,
        isAdminRemoval: true,
      });
      if (result.skipped) {
        results.push({ orgId, status: "skipped", skipped: true });
      } else {
        results.push({ orgId, status: "migrated", files: result.migrated });
      }
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

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
