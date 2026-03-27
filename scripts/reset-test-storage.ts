// @ts-nocheck
/**
 * EXTREMELY DESTRUCTIVE: Wipe ALL platform file storage (B2) for every user, and optionally
 * all related Firestore rows. Intended ONLY for disposable test/staging projects.
 *
 * Does NOT delete Firebase Auth users, profiles, organizations, or Stripe data.
 * Does NOT delete Firebase Storage (e.g. organizations/{orgId}/...); only Backblaze B2.
 *
 * Prerequisites in .env.local:
 *   B2_* variables (always, for listing bucket)
 *   ALLOW_PLATFORM_STORAGE_RESET=true — required only for LIVE deletes (not for --dry-run)
 *   FIREBASE_SERVICE_ACCOUNT_JSON — required only with --with-firestore and not --dry-run
 *
 * Run:
 *   npm run reset-test-storage -- DELETE_ALL_TEST_DATA --dry-run
 *   npm run reset-test-storage -- DELETE_ALL_TEST_DATA
 *   npm run reset-test-storage -- DELETE_ALL_TEST_DATA --with-firestore
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");

/** B2 key prefixes used by this app (see src/lib/b2.ts, uploads, LUT URLs). */
const B2_PREFIXES_TO_WIPE = [
  "backups/",
  "content/",
  "proxies/",
  "thumbnails/",
  "cover-derivatives/",
  "lut-baked/",
  "drives/",
  "galleries/",
];

/** Max objects listed per prefix (raise if your test bucket is huge). */
const MAX_KEYS_PER_PREFIX = 5_000_000;

const FIRESTORE_COLLECTIONS_TO_WIPE = [
  "backup_files",
  "cold_storage_files",
  "backup_snapshots",
  "linked_drives",
  "upload_sessions",
  "macos_package_containers",
  "gallery_assets",
  "favorites_lists",
  "gallery_collections",
  "asset_comments",
  "galleries",
  "file_hearts",
  "file_comments",
  "pinned_items",
  "folder_shares",
  "cold_storage_restore_requirements",
];

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

async function deleteEntireCollection(db, name) {
  const ref = db.collection(name);
  let total = 0;
  const BATCH = 450;
  while (true) {
    const snap = await ref.limit(BATCH).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
    total += snap.docs.length;
    process.stdout.write(`\r  ${name}: deleted ${total}...`);
  }
  if (total > 0) process.stdout.write("\n");
  return total;
}

async function wipeColdStorageConsumerSnapshots(db) {
  const parents = await db.collection("cold_storage_consumer_snapshots").get();
  let totalItems = 0;
  for (const p of parents.docs) {
    const ITEM_BATCH = 400;
    while (true) {
      const items = await p.ref.collection("items").limit(ITEM_BATCH).get();
      if (items.empty) break;
      const batch = db.batch();
      for (const d of items.docs) batch.delete(d.ref);
      await batch.commit();
      totalItems += items.docs.length;
    }
    await p.ref.delete();
  }
  if (parents.docs.length > 0 || totalItems > 0) {
    console.log(
      `  cold_storage_consumer_snapshots: ${parents.docs.length} parent docs, ${totalItems} item docs`
    );
  }
  return parents.docs.length + totalItems;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const withFirestore = args.includes("--with-firestore");
  const posArgs = args.filter((a) => !a.startsWith("--"));

  if (posArgs[0] !== "DELETE_ALL_TEST_DATA") {
    console.error(`
This deletes ALL user file bytes in B2 (known app prefixes) for the configured bucket.

Required: first non-flag argument must be exactly: DELETE_ALL_TEST_DATA

Live deletes (without --dry-run) also require in .env.local:
  ALLOW_PLATFORM_STORAGE_RESET=true

Usage:
  npm run reset-test-storage -- DELETE_ALL_TEST_DATA --dry-run
  npm run reset-test-storage -- DELETE_ALL_TEST_DATA
  npm run reset-test-storage -- DELETE_ALL_TEST_DATA --with-firestore

Flags:
  --dry-run          Count B2 objects only; no deletes (no ALLOW_* env needed)
  --with-firestore   Also delete file-related Firestore collections (see script header)
`);
    process.exit(1);
  }

  if (!dryRun && process.env.ALLOW_PLATFORM_STORAGE_RESET !== "true") {
    console.error(
      "Live delete blocked: set ALLOW_PLATFORM_STORAGE_RESET=true in .env.local, or use --dry-run to only count objects."
    );
    process.exit(1);
  }

  const b2 = require("../src/lib/b2");
  if (!b2.isB2Configured()) {
    console.error("B2 not configured. Set B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME, B2_ENDPOINT in .env.local");
    process.exit(1);
  }

  console.log(`\nBucket: ${process.env.B2_BUCKET_NAME}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE DELETE"}`);
  console.log(`Firestore wipe: ${withFirestore ? "YES" : "NO (B2 only)"}\n`);

  let grandTotal = 0;
  const keysByPrefix: { prefix: string; keys: string[] }[] = [];

  for (const prefix of B2_PREFIXES_TO_WIPE) {
    const keys: string[] = [];
    for await (const key of b2.listObjectKeys(prefix, MAX_KEYS_PER_PREFIX)) {
      keys.push(key);
    }
    console.log(`Prefix ${prefix}: ${keys.length} object(s)`);
    grandTotal += keys.length;
    keysByPrefix.push({ prefix, keys });
  }

  if (grandTotal === 0) {
    console.log("\nNo B2 objects found under app prefixes.");
  } else if (dryRun) {
    console.log(`\nDry run: would delete ${grandTotal} B2 object(s).`);
  } else {
    console.log(`\nDeleting ${grandTotal} B2 object(s)...`);
    let deleted = 0;
    for (const { prefix, keys } of keysByPrefix) {
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        await b2.deleteObjects(chunk);
        deleted += chunk.length;
        process.stdout.write(`\r  ${prefix} ${deleted}/${grandTotal}`);
      }
    }
    console.log("\nB2 wipe complete.");
  }

  if (!withFirestore) {
    if (!dryRun) {
      console.log(
        "\nFirestore unchanged. To also remove backup_files, linked_drives, galleries, etc., re-run with --with-firestore"
      );
    }
    console.log("");
    return;
  }

  const { initializeApp, getApps, cert } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();

  if (dryRun) {
    console.log("\n[DRY RUN] Skipping Firestore deletes (--with-firestore ignored for writes in dry-run).");
    console.log(`Would wipe collections: ${FIRESTORE_COLLECTIONS_TO_WIPE.join(", ")}, cold_storage_consumer_snapshots\n`);
    return;
  }

  console.log("\nWiping Firestore file collections...");
  for (const name of FIRESTORE_COLLECTIONS_TO_WIPE) {
    const n = await deleteEntireCollection(db, name);
    console.log(`  ${name}: ${n} document(s) removed`);
  }
  await wipeColdStorageConsumerSnapshots(db);

  console.log("\n*** Firestore file metadata wiped. Auth users and org docs are unchanged. ***\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
