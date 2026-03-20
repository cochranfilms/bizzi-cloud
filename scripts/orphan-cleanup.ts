/**
 * Standalone script: Find and delete B2 objects (content/, proxies/, thumbnails/)
 * not referenced by backup_files. Catches orphans from failed permanent deletes.
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
  const MAX_ORPHANS_PER_PREFIX = 10_000;

  // 1. Get referenced content + derived proxy/thumb keys from backup_files
  console.log("Loading referenced keys from Firestore...");
  const refContent = new Set();
  const refProxies = new Set();
  const refThumbs = new Set();
  let lastDoc = null;

  while (true) {
    let q = db.collection("backup_files").orderBy("__name__").limit(5000);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      const key = (d.data()?.object_key || "").trim();
      if (key) {
        refContent.add(key);
        refProxies.add(b2.getProxyObjectKey(key));
        refThumbs.add(b2.getVideoThumbnailCacheKey(key));
      }
    }
    if (refContent.size >= MAX_OBJECT_KEYS) break;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 5000) break;
  }

  console.log(`Referenced: ${refContent.size} content keys`);

  // 2. Scan content/, proxies/, thumbnails/
  const contentOrphans = [];
  const proxyOrphans = [];
  const thumbOrphans = [];

  console.log("Scanning B2 content/...");
  for await (const key of b2.listObjectKeys("content/", MAX_OBJECT_KEYS)) {
    if (!refContent.has(key)) {
      contentOrphans.push(key);
      if (contentOrphans.length >= MAX_ORPHANS_PER_PREFIX) break;
    }
  }

  console.log("Scanning B2 proxies/...");
  for await (const key of b2.listObjectKeys("proxies/", MAX_OBJECT_KEYS)) {
    if (!refProxies.has(key)) {
      proxyOrphans.push(key);
      if (proxyOrphans.length >= MAX_ORPHANS_PER_PREFIX) break;
    }
  }

  console.log("Scanning B2 thumbnails/...");
  for await (const key of b2.listObjectKeys("thumbnails/", MAX_OBJECT_KEYS)) {
    if (!refThumbs.has(key)) {
      thumbOrphans.push(key);
      if (thumbOrphans.length >= MAX_ORPHANS_PER_PREFIX) break;
    }
  }

  const total = contentOrphans.length + proxyOrphans.length + thumbOrphans.length;
  console.log(`\nOrphans: content=${contentOrphans.length}, proxies=${proxyOrphans.length}, thumbnails=${thumbOrphans.length} (total ${total})`);

  if (total === 0) {
    console.log("\nNo orphan objects found. B2 is clean.");
    return;
  }

  if (!doDelete) {
    console.log("\nRun with --delete to remove these from B2.");
    return;
  }

  // 3. Build toDelete: content orphans + their proxy/thumb + standalone proxy/thumb orphans
  const toDelete = new Set();
  for (const k of contentOrphans) {
    toDelete.add(k);
    toDelete.add(b2.getProxyObjectKey(k));
    toDelete.add(b2.getVideoThumbnailCacheKey(k));
  }
  proxyOrphans.forEach((k) => toDelete.add(k));
  thumbOrphans.forEach((k) => toDelete.add(k));

  console.log(`\nDeleting ${toDelete.size} objects from B2...`);
  await b2.deleteObjects([...toDelete]);
  console.log(`Deleted ${toDelete.size} objects. Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
