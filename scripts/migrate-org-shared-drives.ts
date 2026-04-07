/**
 * Migrate legacy org "Shared Storage / Shared RAW / Shared Gallery" linked_drives onto
 * the organization admin's matching member pillar drive (Storage, RAW, Gallery Media),
 * then soft-delete the shared drives and delete org_shared workspaces that pointed at them.
 *
 * Does NOT copy objects in B2 — object_key is left unchanged (downloads use stored keys).
 *
 * Usage:
 *   npm run migrate:org-shared-drives                         # dry-run (default)
 *   npm run migrate:org-shared-drives -- --execute            # apply changes
 *   npm run migrate:org-shared-drives -- --execute --org-id=ABC123
 *
 * Requires .env.local with FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH.
 */
import type { DocumentReference, Firestore } from "firebase-admin/firestore";

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
  console.error(
    "Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local"
  );
  process.exit(1);
}

function parseArgs(): { execute: boolean; orgId: string | null } {
  const execute = process.argv.includes("--execute");
  let orgId: string | null = null;
  for (const a of process.argv) {
    if (a.startsWith("--org-id=")) orgId = a.slice("--org-id=".length).trim() || null;
  }
  return { execute, orgId };
}

type Pillar = "storage" | "raw" | "gallery";

function sharedDrivePillar(name: string, isCreatorRaw: boolean): Pillar | null {
  const n = (name ?? "").toLowerCase();
  if (isCreatorRaw || n.includes("raw")) return "raw";
  if (n.includes("gallery")) return "gallery";
  if (n.includes("storage")) return "storage";
  return null;
}

function memberDriveMatchesPillar(data: Record<string, unknown>, pillar: Pillar): boolean {
  if (data.deleted_at) return false;
  if (data.is_org_shared === true) return false;
  const name = String(data.name ?? "").toLowerCase();
  const isRaw = data.is_creator_raw === true;
  if (pillar === "raw") return isRaw || name === "raw";
  if (pillar === "gallery")
    return !isRaw && (name === "gallery media" || name.includes("gallery"));
  return !isRaw && !name.includes("gallery") && (name === "storage" || name === "uploads");
}

async function resolveOrgAdminUid(db: Firestore, orgId: string): Promise<string | null> {
  const seats = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("status", "==", "active")
    .get();
  const admin = seats.docs.find((d) => String(d.data().role ?? "") === "admin");
  const uid = String(admin?.data()?.user_id ?? "").trim();
  if (uid) return uid;
  const any = String(seats.docs[0]?.data()?.user_id ?? "").trim();
  return any || null;
}

async function findMemberDriveForPillar(
  db: Firestore,
  orgId: string,
  ownerUid: string,
  pillar: Pillar
): Promise<string | null> {
  const snap = await db
    .collection("linked_drives")
    .where("organization_id", "==", orgId)
    .where("userId", "==", ownerUid)
    .get();
  for (const d of snap.docs) {
    if (memberDriveMatchesPillar(d.data(), pillar)) return d.id;
  }
  return null;
}

async function findExistingPrivateWorkspaceId(
  db: Firestore,
  orgId: string,
  driveId: string,
  adminUid: string
): Promise<string | null> {
  const existing = await db
    .collection("workspaces")
    .where("organization_id", "==", orgId)
    .where("drive_id", "==", driveId)
    .where("workspace_type", "==", "private")
    .limit(20)
    .get();
  for (const doc of existing.docs) {
    if (doc.data().created_by === adminUid) return doc.id;
  }
  return null;
}

async function getOrCreatePrivateWorkspaceId(
  db: Firestore,
  orgId: string,
  driveId: string,
  adminUid: string,
  driveType: "storage" | "raw" | "gallery"
): Promise<string> {
  const found = await findExistingPrivateWorkspaceId(db, orgId, driveId, adminUid);
  if (found) return found;

  const workspacesRef = db.collection("workspaces");
  const now = new Date().toISOString();
  const workspaceName =
    driveType === "raw"
      ? "My Private RAW"
      : driveType === "gallery"
        ? "Gallery Drafts"
        : "My Private";
  const ref = workspacesRef.doc();
  await ref.set({
    organization_id: orgId,
    drive_id: driveId,
    drive_type: driveType,
    name: workspaceName,
    workspace_type: "private",
    created_by: adminUid,
    member_user_ids: [adminUid],
    team_id: null,
    project_id: null,
    gallery_id: null,
    is_system_workspace: true,
    created_at: now,
    updated_at: now,
  });
  return ref.id;
}

function driveTypeFromPillar(p: Pillar): "storage" | "raw" | "gallery" {
  if (p === "raw") return "raw";
  if (p === "gallery") return "gallery";
  return "storage";
}

const BATCH = 450;

async function commitInBatches(
  db: Firestore,
  ops: Array<{ ref: DocumentReference; data: Record<string, unknown> }>
) {
  for (let i = 0; i < ops.length; i += BATCH) {
    const chunk = ops.slice(i, i + BATCH);
    const batch = db.batch();
    for (const { ref, data } of chunk) {
      batch.update(ref, data);
    }
    await batch.commit();
  }
}

type MigPlanEntry = { targetId: string; pillar: Pillar };

async function main() {
  const { execute, orgId: orgIdFilter } = parseArgs();
  if (!execute) {
    console.log("DRY RUN — no writes. Pass --execute to apply.\n");
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore() as Firestore;

  const orgIds: string[] = [];
  if (orgIdFilter) {
    const o = await db.collection("organizations").doc(orgIdFilter).get();
    if (!o.exists) {
      console.error(`Organization not found: ${orgIdFilter}`);
      process.exit(1);
    }
    orgIds.push(orgIdFilter);
  } else {
    const orgsSnap = await db.collection("organizations").get();
    for (const d of orgsSnap.docs) orgIds.push(d.id);
  }

  let sharedDrivesSeen = 0;
  let foldersUpdated = 0;
  let filesUpdated = 0;
  let snapshotsUpdated = 0;
  let workspacesRemoved = 0;
  let drivesRetired = 0;
  const skipped: string[] = [];

  for (const orgId of orgIds) {
    const adminUid = await resolveOrgAdminUid(db, orgId);
    if (!adminUid) {
      skipped.push(`${orgId}: no active seat / admin`);
      continue;
    }

    const drivesSnap = await db
      .collection("linked_drives")
      .where("organization_id", "==", orgId)
      .get();

    const sharedDocs = drivesSnap.docs.filter((d) => {
      const x = d.data();
      return x.is_org_shared === true && !x.deleted_at;
    });

    if (sharedDocs.length === 0) continue;

    const plan = new Map<string, MigPlanEntry>();

    for (const doc of sharedDocs) {
      sharedDrivesSeen++;
      const data = doc.data();
      const pillar = sharedDrivePillar(String(data.name ?? ""), data.is_creator_raw === true);
      if (!pillar) {
        skipped.push(`${orgId} drive ${doc.id}: unknown pillar (${data.name})`);
        continue;
      }
      const targetId = await findMemberDriveForPillar(db, orgId, adminUid, pillar);
      if (!targetId) {
        skipped.push(
          `${orgId} shared ${doc.id} (${data.name}): no admin ${pillar} pillar for uid ${adminUid}`
        );
        continue;
      }
      plan.set(doc.id, { targetId, pillar });
    }

    if (plan.size === 0) continue;

    console.log(
      `\nOrg ${orgId} admin=${adminUid}\n${[...plan.entries()]
        .map(([s, { targetId }]) => `  shared ${s} -> member ${targetId}`)
        .join("\n")}`
    );

    for (const [sharedId, { targetId, pillar }] of plan) {
      const fCount = await db
        .collection("storage_folders")
        .where("linked_drive_id", "==", sharedId)
        .count()
        .get();
      const bCount = await db
        .collection("backup_files")
        .where("linked_drive_id", "==", sharedId)
        .count()
        .get();
      const sCount = await db
        .collection("backup_snapshots")
        .where("linked_drive_id", "==", sharedId)
        .count()
        .get();
      const existingWs = await findExistingPrivateWorkspaceId(db, orgId, targetId, adminUid);
      const wsNote =
        existingWs ??
        (execute
          ? "(none yet; created at start of execute pass if still missing)"
          : "(would create private workspace on --execute)");
      console.log(
        `  shared ${sharedId}: storage_folders=${fCount.data().count} backup_files=${bCount.data().count} backup_snapshots=${sCount.data().count} workspace→${wsNote} pillar=${pillar}`
      );
    }

    if (!execute) continue;

    for (const [sharedId, { targetId, pillar }] of plan) {
      const workspaceId = await getOrCreatePrivateWorkspaceId(
        db,
        orgId,
        targetId,
        adminUid,
        driveTypeFromPillar(pillar)
      );

      const folderSnap = await db
        .collection("storage_folders")
        .where("linked_drive_id", "==", sharedId)
        .get();
      const folderOps = folderSnap.docs.map((fd) => ({
        ref: fd.ref,
        data: {
          linked_drive_id: targetId,
          organization_id: orgId,
          updated_at: FieldValue.serverTimestamp(),
        },
      }));
      await commitInBatches(db, folderOps);
      foldersUpdated += folderSnap.size;

      const fileSnap = await db
        .collection("backup_files")
        .where("linked_drive_id", "==", sharedId)
        .get();
      const fileOps = fileSnap.docs.map((fdoc) => ({
        ref: fdoc.ref,
        data: {
          linked_drive_id: targetId,
          workspace_id: workspaceId,
          visibility_scope: "private_org",
        },
      }));
      await commitInBatches(db, fileOps);
      filesUpdated += fileSnap.size;

      const snapSnap = await db
        .collection("backup_snapshots")
        .where("linked_drive_id", "==", sharedId)
        .get();
      const snapOps = snapSnap.docs.map((s) => ({
        ref: s.ref,
        data: { linked_drive_id: targetId },
      }));
      await commitInBatches(db, snapOps);
      snapshotsUpdated += snapSnap.size;

      const wsSnap = await db
        .collection("workspaces")
        .where("organization_id", "==", orgId)
        .where("drive_id", "==", sharedId)
        .where("workspace_type", "==", "org_shared")
        .get();
      for (const w of wsSnap.docs) {
        await w.ref.delete();
        workspacesRemoved++;
      }

      await db.collection("linked_drives").doc(sharedId).update({
        deleted_at: new Date().toISOString(),
        is_org_shared: false,
      });
      drivesRetired++;
    }
  }

  console.log("\n--- summary ---");
  console.log(`Shared drives processed (candidates): ${sharedDrivesSeen}`);
  if (execute) {
    console.log(`storage_folders updated: ${foldersUpdated}`);
    console.log(`backup_files updated: ${filesUpdated}`);
    console.log(`backup_snapshots updated: ${snapshotsUpdated}`);
    console.log(`org_shared workspaces deleted: ${workspacesRemoved}`);
    console.log(`shared linked_drives soft-deleted: ${drivesRetired}`);
  }
  if (skipped.length) {
    console.log("\nSkipped / warnings:");
    skipped.forEach((s) => console.log(`  ${s}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
