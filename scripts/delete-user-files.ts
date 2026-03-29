// @ts-nocheck
/**
 * ONE-TIME DESTRUCTIVE SCRIPT: Delete ALL files associated with a user by email.
 * Removes: backup_files, cold_storage_files, B2 objects, linked_drives, backup_snapshots,
 * galleries, gallery_assets, favorites_lists, gallery_collections, asset_comments,
 * file_hearts, pinned_items, cold_storage snapshots.
 *
 * Run: npm run delete-user-files -- <email> DELETE_ALL
 *
 * Requires .env.local: FIREBASE_SERVICE_ACCOUNT_JSON, B2_* vars.
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");

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
  console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON in .env.local");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[1] !== "DELETE_ALL") {
    console.error("DESTRUCTIVE: Deletes ALL files for a user from Firestore and B2.");
    console.error("Usage: npm run delete-user-files -- <email> DELETE_ALL");
    console.error("Example: npm run delete-user-files -- codylcochran87@gmail.com DELETE_ALL");
    process.exit(1);
  }

  const email = args[0].trim().toLowerCase();

  const { initializeApp, getApps, cert } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { getAuth } = require("firebase-admin/auth");

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();
  const auth = getAuth();

  let userId: string;
  try {
    const userRecord = await auth.getUserByEmail(email);
    userId = userRecord.uid;
  } catch (err) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  console.log(`\n*** DELETING ALL FILES FOR ${email} (${userId}) ***\n`);

  const b2 = require("../src/lib/b2");
  const hasB2 = b2.isB2Configured();

  // 1. Collect all backup_files for this user (personal + org)
  const backupSnap = await db.collection("backup_files").where("userId", "==", userId).get();
  const backupFiles = backupSnap.docs.map((d) => ({
    id: d.id,
    object_key: (d.data().object_key as string) ?? "",
    linked_drive_id: d.data().linked_drive_id as string,
  }));
  const objectKeysFromBackup = new Set(
    backupFiles.map((f) => f.object_key).filter(Boolean)
  );

  // 2. Collect all cold_storage_files for this user (personal + org)
  const coldSnap = await db
    .collection("cold_storage_files")
    .where("user_id", "==", userId)
    .get();
  const coldFiles = coldSnap.docs.map((d) => ({
    id: d.id,
    object_key: (d.data().object_key as string) ?? "",
  }));
  coldFiles.forEach((f) => {
    if (f.object_key) objectKeysFromBackup.add(f.object_key);
  });

  const allObjectKeys = Array.from(objectKeysFromBackup);
  console.log(`backup_files: ${backupFiles.length}`);
  console.log(`cold_storage_files: ${coldFiles.length}`);
  console.log(`unique B2 object_keys: ${allObjectKeys.length}`);

  // 3. Get linked_drive ids
  const driveSnap = await db.collection("linked_drives").where("userId", "==", userId).get();
  const driveIds = driveSnap.docs.map((d) => d.id);

  // 4. Get gallery ids (user's galleries - personal and org)
  const gallerySnap = await db
    .collection("galleries")
    .where("photographer_id", "==", userId)
    .get();
  const galleryIds = gallerySnap.docs.map((d) => d.id);

  // 5. Delete B2 objects (only if no OTHER backup_file references it)
  let b2Deleted = 0;
  let b2Skipped = 0;
  if (hasB2 && allObjectKeys.length > 0) {
    console.log("\nDeleting from B2...");
    for (const objectKey of allObjectKeys) {
      const refsSnap = await db
        .collection("backup_files")
        .where("object_key", "==", objectKey)
        .get();
      const refsFromOtherUsers = refsSnap.docs.filter((d) => d.data().userId !== userId);
      if (refsFromOtherUsers.length > 0) {
        b2Skipped++;
        continue;
      }
      try {
        await b2.deleteObjectWithRetry(objectKey);
        b2Deleted++;
        const proxyKey = b2.getProxyObjectKey(objectKey);
        const thumbKey = b2.getVideoThumbnailCacheKey(objectKey);
        await Promise.all([
          b2.deleteObjectWithRetry(proxyKey).catch(() => {}),
          b2.deleteObjectWithRetry(thumbKey).catch(() => {}),
        ]);
      } catch (err) {
        console.error("B2 delete failed:", objectKey, err);
      }
    }
    console.log(`B2: deleted ${b2Deleted} content objects (+ proxies/thumbnails), skipped ${b2Skipped} (shared)`);
  } else if (!hasB2) {
    console.log("B2 not configured - skipping B2 deletes");
  }

  // 6. Delete Firestore: backup_files
  const BATCH_SIZE = 500;
  for (let i = 0; i < backupFiles.length; i += BATCH_SIZE) {
    const chunk = backupFiles.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((f) => batch.delete(db.collection("backup_files").doc(f.id)));
    await batch.commit();
  }
  console.log(`Deleted ${backupFiles.length} backup_files`);

  // 7. Delete Firestore: cold_storage_files
  for (let i = 0; i < coldFiles.length; i += BATCH_SIZE) {
    const chunk = coldFiles.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((f) => batch.delete(db.collection("cold_storage_files").doc(f.id)));
    await batch.commit();
  }
  console.log(`Deleted ${coldFiles.length} cold_storage_files`);

  // 8. Delete backup_snapshots for user's drives
  let snapDeleted = 0;
  for (const driveId of driveIds) {
    const snapSnap = await db
      .collection("backup_snapshots")
      .where("linked_drive_id", "==", driveId)
      .get();
    for (const d of snapSnap.docs) {
      await d.ref.delete();
      snapDeleted++;
    }
  }
  console.log(`Deleted ${snapDeleted} backup_snapshots`);

  // 9. Delete gallery assets, favorites_lists, gallery_collections, asset_comments
  for (let i = 0; i < galleryIds.length; i += 10) {
    const batch = galleryIds.slice(i, i + 10);
    const assetsSnap = await db
      .collection("gallery_assets")
      .where("gallery_id", "in", batch)
      .get();
    for (let j = 0; j < assetsSnap.docs.length; j += BATCH_SIZE) {
      const chunk = assetsSnap.docs.slice(j, j + BATCH_SIZE);
      const wb = db.batch();
      chunk.forEach((d) => wb.delete(d.ref));
      await wb.commit();
    }
  }
  for (const gid of galleryIds) {
    const listsSnap = await db.collection("favorites_lists").where("gallery_id", "==", gid).get();
    for (const d of listsSnap.docs) await d.ref.delete();
    const mergeSnap = await db
      .collection("galleries")
      .doc(gid)
      .collection("proofing_merge_runs")
      .get();
    for (const d of mergeSnap.docs) await d.ref.delete();
    const collSnap = await db.collection("gallery_collections").where("gallery_id", "==", gid).get();
    for (const d of collSnap.docs) await d.ref.delete();
    const commentSnap = await db.collection("asset_comments").where("gallery_id", "==", gid).get();
    for (const d of commentSnap.docs) await d.ref.delete();
  }
  for (const d of gallerySnap.docs) await d.ref.delete();
  console.log(`Deleted ${galleryIds.length} galleries + assets/lists/collections/comments`);

  // 10. Delete file_hearts, pinned_items
  const heartsSnap = await db.collection("file_hearts").where("userId", "==", userId).get();
  for (const d of heartsSnap.docs) await d.ref.delete();
  const pinnedSnap = await db.collection("pinned_items").where("userId", "==", userId).get();
  for (const d of pinnedSnap.docs) await d.ref.delete();
  console.log(`Deleted ${heartsSnap.docs.length} file_hearts, ${pinnedSnap.docs.length} pinned_items`);

  // 11. Delete cold_storage_consumer_snapshots
  const snapshotDoc = db.collection("cold_storage_consumer_snapshots").doc(userId);
  const itemsSnap = await snapshotDoc.collection("items").get();
  for (const d of itemsSnap.docs) await d.ref.delete();
  await snapshotDoc.delete().catch(() => {});
  console.log("Deleted cold_storage snapshots");

  // 12. Delete cold_storage_restore_requirements
  await db.collection("cold_storage_restore_requirements").doc(userId).delete().catch(() => {});

  // 13. Delete linked_drives
  for (const d of driveSnap.docs) await d.ref.delete();
  console.log(`Deleted ${driveIds.length} linked_drives`);

  console.log("\n*** Done. All files for", email, "have been deleted. ***\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
