/**
 * Migration: Add workspace_id and visibility_scope to org backup_files.
 * Maps existing org files into "My Private" workspace per drive (private_org visibility).
 * Personal files get visibility_scope: "personal".
 *
 * Run with: npm run migrate:org-files-to-workspaces
 * Idempotent: skips files that already have workspace_id.
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

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

function getDriveType(driveData: { name?: string; is_creator_raw?: boolean }): "storage" | "raw" | "gallery" | null {
  if (driveData.is_creator_raw === true) return "raw";
  const name = (driveData.name ?? "").toLowerCase();
  if (name === "storage" || name === "uploads") return "storage";
  if (name === "gallery media") return "gallery";
  return null;
}

async function main() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccountJson();
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  }
  const db = getFirestore();

  const now = new Date().toISOString();
  const workspacesRef = db.collection("workspaces");
  const driveToWorkspaceId = new Map<string, string>();

  // 1. Get or create "My Private" workspace for each org drive
  const orgsSnap = await db.collection("organizations").get();
  let workspacesCreated = 0;

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    const drivesSnap = await db
      .collection("linked_drives")
      .where("organization_id", "==", orgId)
      .get();

    for (const driveDoc of drivesSnap.docs) {
      if (driveDoc.data().deleted_at) continue;

      const driveId = driveDoc.id;
      const driveData = driveDoc.data();
      const userId = driveData.userId;
      const driveType = getDriveType(driveData);

      // Check if workspace already exists for this drive
      const existingSnap = await workspacesRef
        .where("organization_id", "==", orgId)
        .where("drive_id", "==", driveId)
        .where("workspace_type", "==", "private")
        .limit(1)
        .get();

      let workspaceId: string;
      if (!existingSnap.empty) {
        workspaceId = existingSnap.docs[0].id;
      } else {
        const workspaceRef = workspacesRef.doc();
        const workspaceName = driveType === "raw" ? "My Private RAW" : driveType === "gallery" ? "Gallery Drafts" : "My Private";
        await workspaceRef.set({
          organization_id: orgId,
          drive_id: driveId,
          drive_type: driveType,
          name: workspaceName,
          workspace_type: "private",
          created_by: userId,
          member_user_ids: [userId],
          team_id: null,
          project_id: null,
          gallery_id: null,
          is_system_workspace: true,
          created_at: now,
          updated_at: now,
        });
        workspaceId = workspaceRef.id;
        workspacesCreated++;
      }
      driveToWorkspaceId.set(driveId, workspaceId);
    }
  }

  console.log(`Workspaces: ${workspacesCreated} created, ${driveToWorkspaceId.size} total drive→workspace mappings`);

  // 2. Migrate org backup_files (query per org to avoid Firestore != null limitation)
  let orgFilesUpdated = 0;
  let orgFilesSkipped = 0;
  let orgFilesTotal = 0;
  const BATCH_SIZE = 500;

  const batch = db.batch();
  let batchCount = 0;

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    const orgFilesSnap = await db
      .collection("backup_files")
      .where("organization_id", "==", orgId)
      .get();

    for (const doc of orgFilesSnap.docs) {
      const data = doc.data();
      orgFilesTotal++;

      if (data.workspace_id) {
        orgFilesSkipped++;
        continue;
      }
      if (data.deleted_at) continue;

      const driveId = data.linked_drive_id;
      const workspaceId = driveToWorkspaceId.get(driveId);
      if (!workspaceId) {
        console.warn(`No workspace for drive ${driveId}, file ${doc.id}`);
        continue;
      }

      batch.update(doc.ref, {
        workspace_id: workspaceId,
        visibility_scope: "private_org",
        owner_user_id: data.userId ?? null,
        updated_at: FieldValue.serverTimestamp(),
      });
      orgFilesUpdated++;
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batchCount = 0;
        console.log(`  Committed batch, org files updated so far: ${orgFilesUpdated}`);
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Org backup_files: ${orgFilesUpdated} updated, ${orgFilesSkipped} skipped (already had workspace_id), ${orgFilesTotal} total`);

  // 3. Migrate personal backup_files (visibility_scope only)
  let personalUpdated = 0;
  let personalSkipped = 0;
  let personalTotal = 0;

  const personalFilesSnap = await db
    .collection("backup_files")
    .where("organization_id", "==", null)
    .get();

  const personalBatch = db.batch();
  let personalBatchCount = 0;

  for (const doc of personalFilesSnap.docs) {
    const data = doc.data();
    personalTotal++;

    if (data.visibility_scope !== undefined && data.visibility_scope !== null) {
      personalSkipped++;
      continue;
    }
    if (data.deleted_at) continue;

    personalBatch.update(doc.ref, {
      visibility_scope: "personal",
      updated_at: FieldValue.serverTimestamp(),
    });
    personalUpdated++;
    personalBatchCount++;

    if (personalBatchCount >= BATCH_SIZE) {
      await personalBatch.commit();
      personalBatchCount = 0;
      console.log(`  Committed personal batch, updated so far: ${personalUpdated}`);
    }
  }

  if (personalBatchCount > 0) {
    await personalBatch.commit();
  }

  console.log(`Personal backup_files: ${personalUpdated} updated, ${personalSkipped} skipped, ${personalTotal} total`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
