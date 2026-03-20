/**
 * Standalone script: Find and delete B2 content/ objects not referenced by backup_files.
 * These are orphan files (e.g. from permanent deletes where B2 delete failed, or historical bugs).
 *
 * Run with: npm run orphan-cleanup [-- --delete]
 *   - Without --delete: dry run, report orphans only
 *   - With --delete: actually delete orphan objects from B2
 *
 * Requires: .env.local with FIREBASE_SERVICE_ACCOUNT_JSON (or path) and B2_* vars.
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");

async function main() {
  const doDelete = process.argv.includes("--delete");
  if (doDelete) {
    console.log("Mode: DELETE (will remove orphan objects from B2)\n");
  } else {
    console.log("Mode: DRY RUN (use --delete to actually remove orphans)\n");
  }

  // Initialize Firebase Admin
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
      process.exit(1);
    }
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) return json;
    console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local");
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();

  // B2 - require resolves via ts-node
  const b2 = require("../src/lib/b2");
  if (!b2.isB2Configured()) {
    console.error("B2 not configured. Set B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME, B2_ENDPOINT in .env.local");
    process.exit(1);
  }

  const MAX_OBJECT_KEYS = 500_000;
  const MAX_ORPHANS_TO_DELETE = 10_000;

  // 1. Get all object_keys referenced in backup_files
  console.log("Loading referenced object keys from Firestore...");
  const keys = new Set<string>();
  let lastDoc: unknown = null;

  while (true) {
    let q = db.collection("backup_files").orderBy("__name__").limit(5000);
    if (lastDoc) {
      q = q.startAfter(lastDoc) as typeof q;
    }
    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      const key = (d.data()?.object_key as string) ?? "";
      if (key) keys.add(key);
    }
    if (keys.size >= MAX_OBJECT_KEYS) break;

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 5000) break;
  }

  console.log(`Referenced keys in Firestore: ${keys.size}`);

  // 2. List B2 content/ and find orphans
  console.log("Scanning B2 content/ prefix...");
  const orphans: string[] = [];
  let checked = 0;

  for await (const key of b2.listObjectKeys("content/", MAX_OBJECT_KEYS)) {
    checked++;
    if (!keys.has(key)) {
      orphans.push(key);
      if (orphans.length >= MAX_ORPHANS_TO_DELETE) break;
    }
  }

  console.log(`Checked ${checked} B2 objects, found ${orphans.length} orphans`);

  if (orphans.length === 0) {
    console.log("\nNo orphan objects found. B2 is clean.");
    return;
  }

  console.log("\nSample orphan keys (first 20):");
  orphans.slice(0, 20).forEach((k) => console.log(`  ${k}`));
  if (orphans.length > 20) {
    console.log(`  ... and ${orphans.length - 20} more`);
  }

  if (!doDelete) {
    console.log("\nRun with --delete to remove these from B2.");
    return;
  }

  // 3. Delete orphans + their proxy + thumbnail
  const toDelete: string[] = [];
  const seen = new Set<string>();
  for (const key of orphans) {
    toDelete.push(key);
    const proxyKey = b2.getProxyObjectKey(key);
    const thumbKey = b2.getVideoThumbnailCacheKey(key);
    if (!seen.has(proxyKey)) {
      toDelete.push(proxyKey);
      seen.add(proxyKey);
    }
    if (!seen.has(thumbKey)) {
      toDelete.push(thumbKey);
      seen.add(thumbKey);
    }
  }

  console.log(`\nDeleting ${toDelete.length} objects from B2...`);
  await b2.deleteObjects(toDelete);
  console.log(`Deleted ${toDelete.length} objects. Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
