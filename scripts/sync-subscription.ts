/**
 * Sync subscription and restore cold storage for a user (by email or userId).
 * Use when the Settings "Sync subscription from Stripe" button isn't available
 * (e.g. desktop app) or when a webhook failed.
 *
 * Run: npm run sync-subscription -- <email>
 *   or: npm run sync-subscription -- <userId>
 *   or: npm run sync-subscription -- <email> --plan solo   (override plan if Stripe lookup fails)
 *
 * Requires .env.local with:
 *   FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_JSON_PATH)
 *   STRIPE_SECRET_KEY
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");

type PlanId = "free" | "solo" | "indie" | "video" | "production";

function getServiceAccountJson(): string {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
  if (pathEnv) {
    const fullPath = path.resolve(process.cwd(), pathEnv);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf8");
    }
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return json;
  console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local");
  process.exit(1);
}

function getStorageBytesForPlan(planId: PlanId): number {
  const PLAN_STORAGE_BYTES: Record<PlanId, number> = {
    free: 2 * 1024 * 1024 * 1024,
    solo: 1 * 1024 * 1024 * 1024 * 1024,
    indie: 2 * 1024 * 1024 * 1024 * 1024,
    video: 5 * 1024 * 1024 * 1024 * 1024,
    production: 10 * 1024 * 1024 * 1024 * 1024,
  };
  return PLAN_STORAGE_BYTES[planId] ?? PLAN_STORAGE_BYTES.free;
}

function looksLikeUid(s: string): boolean {
  return /^[a-zA-Z0-9]{20,}$/.test(s) && s.length <= 128;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npm run sync-subscription -- <email|userId> [--plan solo|indie|video|production]");
    console.error("Example: npm run sync-subscription -- user@example.com");
    console.error("         npm run sync-subscription -- user@example.com --plan solo");
    process.exit(1);
  }

  const input = args[0].trim();
  const planOverride = args.includes("--plan")
    ? (args[args.indexOf("--plan") + 1] as PlanId)
    : null;

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY not set in .env.local");
    process.exit(1);
  }

  const { initializeApp, getApps, cert } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { getAuth } = require("firebase-admin/auth");
  const Stripe = require("stripe");

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();
  const auth = getAuth();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let userId: string;
  let email: string;

  if (looksLikeUid(input)) {
    const userRecord = await auth.getUser(input);
    userId = userRecord.uid;
    email = (userRecord.email ?? "").trim().toLowerCase();
  } else {
    const userRecord = await auth.getUserByEmail(input);
    userId = userRecord.uid;
    email = (userRecord.email ?? "").trim().toLowerCase();
  }

  console.log(`User: ${userId} (${email})`);
  console.log("Syncing PERSONAL subscription and storage only (organization data is separate).");

  let planId: PlanId = "solo";
  let addonIds: string[] = [];
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;

  if (planOverride) {
    planId = planOverride;
    console.log(`Using plan override: ${planId}`);
  } else {
    const customers = await stripe.customers.list({ email, limit: 5 });
    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status: "active",
        limit: 5,
      });
      for (const sub of subs.data) {
        const metaUserId = sub.metadata?.userId;
        if (metaUserId === userId || !metaUserId) {
          planId = (sub.metadata?.planId as PlanId) ?? "solo";
          const raw = sub.metadata?.addonIds ?? "";
          addonIds = raw.split(",").filter(Boolean);
          stripeCustomerId = customer.id;
          stripeSubscriptionId = sub.id;
          break;
        }
      }
      if (stripeSubscriptionId) break;
    }
    if (stripeSubscriptionId) {
      console.log(`Found Stripe subscription: ${stripeSubscriptionId}, plan: ${planId}`);
    } else {
      console.log("No active Stripe subscription found, using plan: solo");
      planId = "solo";
    }
  }

  let storageQuotaBytes = getStorageBytesForPlan(planId);
  let storageAddonId: string | null = null;
  if (stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ["items.data.price"],
      });
      const items = sub.items.data;
      for (const item of items) {
        if (item.deleted) continue;
        const meta = item.price?.metadata;
        const addonId = meta?.storage_addon_id as string | undefined;
        const tb = meta?.storage_addon_tb ? parseInt(String(meta.storage_addon_tb), 10) : 0;
        if (addonId && !isNaN(tb) && tb > 0) {
          storageQuotaBytes += tb * 1024 ** 4;
          storageAddonId = addonId;
        }
      }
    } catch (err) {
      console.error("Failed to expand subscription:", err);
    }
  }

  await db.collection("profiles").doc(userId).set(
    {
      userId,
      plan_id: planId,
      addon_ids: addonIds,
      storage_quota_bytes: storageQuotaBytes,
      storage_addon_id: storageAddonId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log("Profile updated");

  const { ensureDefaultDrivesForUser } = require("../src/lib/ensure-default-drives");
  await ensureDefaultDrivesForUser(userId);
  console.log("Default drives ensured (Storage, RAW, Gallery Media); createdAt backfilled for any missing drives)");

  const { restoreColdStorageToHot } = require("../src/lib/cold-storage-restore");
  const result = await restoreColdStorageToHot({ type: "consumer", userId });
  console.log(
    `Cold storage restore: ${result.restored} files, ${result.drivesCreated} drives`
  );

  if (result.restored === 0 && result.drivesCreated === 0) {
    const { hasColdStorage } = require("../src/lib/cold-storage-restore");
    const hasCold = await hasColdStorage({ userId });
    if (!hasCold) {
      console.log("(No cold storage files for this user – nothing to restore)");
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
