/**
 * One-time migration: set organization_id: null on all existing
 * linked_drives and backup_files that don't have the field.
 * Run with: npm run migrate:organization-id
 *
 * Loads FIREBASE_SERVICE_ACCOUNT_JSON from .env.local if not set.
 * After this, personal storage = organization_id is null.
 * Enterprise storage = organization_id is orgId (set when creating in enterprise context).
 */
// Load .env.local first (must run before other imports)
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function getServiceAccountJson(): string {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
  if (pathEnv) {
    const fullPath = path.resolve(process.cwd(), pathEnv);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf8");
    }
    console.error(`File not found: ${fullPath}`);
    console.error("Create firebase-service-account.json with your Firebase service account JSON (from Firebase Console > Project Settings > Service Accounts > Generate key).");
    process.exit(1);
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return json;
  console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local");
  process.exit(1);
}

async function main() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccountJson();
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  }
  const db = getFirestore();

  let linkedUpdated = 0;
  let linkedTotal = 0;
  const drivesSnap = await db.collection("linked_drives").get();
  for (const d of drivesSnap.docs) {
    linkedTotal++;
    if (d.data().organization_id === undefined) {
      await d.ref.update({ organization_id: null });
      linkedUpdated++;
    }
  }
  console.log(`linked_drives: ${linkedUpdated}/${linkedTotal} updated`);

  let filesUpdated = 0;
  let filesTotal = 0;
  const filesSnap = await db.collection("backup_files").get();
  for (const d of filesSnap.docs) {
    filesTotal++;
    if (d.data().organization_id === undefined) {
      await d.ref.update({ organization_id: null });
      filesUpdated++;
    }
  }
  console.log(`backup_files: ${filesUpdated}/${filesTotal} updated`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
