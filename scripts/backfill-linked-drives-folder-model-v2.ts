/**
 * Backfill `linked_drives` pillar drives (Storage / Gallery Media) that are still on the
 * legacy folder model: sets `folder_model_version: 2`, `supports_nested_folders: true`, and
 * runs the same migration as the in-app "Update Storage" flow (storage_folders + file fields).
 *
 * Dry run (default — prints drive ids that would be migrated):
 *   DOTENV_CONFIG_PATH=.env.local npx ts-node -r ./scripts/register-paths.js \
 *     --compiler-options '{"module":"CommonJS","esModuleInterop":true}' -r dotenv/config \
 *     scripts/backfill-linked-drives-folder-model-v2.ts
 *
 * Apply:
 *   ... scripts/backfill-linked-drives-folder-model-v2.ts --apply
 *
 * Optional:
 *   --limit=50 Stop after N successful migrations (apply mode)
 *   --drive-id=X   Only consider this linked_drive document id
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local.
 */
import * as fs from "fs";
import * as path from "path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { teamAwareBaseDriveName } from "@/lib/storage-folder-model-policy";
import { migrateLinkedDriveToFolderModelV2 } from "@/lib/storage-folders/migrate-drive-v2";

function getServiceAccountJson(): string {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
  if (pathEnv) {
    const fullPath = path.resolve(process.cwd(), pathEnv);
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, "utf8");
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return json;
  console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH");
  process.exit(1);
}

function parseArgs() {
  const apply = process.argv.includes("--apply");
  let limit: number | null = null;
  let onlyDriveId: string | null = null;
  for (const a of process.argv) {
    if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
    }
    if (a.startsWith("--drive-id=")) {
      onlyDriveId = a.slice("--drive-id=".length).trim() || null;
    }
  }
  return { apply, limit, onlyDriveId };
}

const PAGE = 400;

function pillarNeedsV2(data: DocumentData): boolean {
  if (data.deleted_at) return false;
  if (data.is_creator_raw === true) return false;
  let base = teamAwareBaseDriveName(String(data.name ?? ""));
  if (base === "Uploads") base = "Storage";
  if (base !== "Storage" && base !== "Gallery Media") return false;
  if (Number(data.folder_model_version) === 2) return false;
  return true;
}

async function main() {
  const { apply, limit, onlyDriveId } = parseArgs();

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();

  if (onlyDriveId) {
    const ref = db.collection("linked_drives").doc(onlyDriveId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.error(`No linked_drive: ${onlyDriveId}`);
      process.exit(1);
    }
    const data = snap.data()!;
    if (!pillarNeedsV2(data)) {
      console.log(JSON.stringify({ driveId: onlyDriveId, skipped: true, reason: "not a legacy pillar drive" }));
      return;
    }
    const uid = String(data.userId ?? "");
    if (!uid) {
      console.error(`linked_drive ${onlyDriveId} has no userId`);
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        mode: apply ? "apply" : "dry-run",
        driveId: onlyDriveId,
        name: data.name,
        userId: uid,
      })
    );
    if (!apply) return;
    const result = await migrateLinkedDriveToFolderModelV2(db, uid, onlyDriveId);
    console.log(JSON.stringify({ ok: true, driveId: onlyDriveId, ...result }));
    return;
  }

  let last: QueryDocumentSnapshot | undefined;
  let scanned = 0;
  let queued = 0;
  let migrated = 0;
  const errors: Array<{ id: string; error: string }> = [];

  while (true) {
    let q = db.collection("linked_drives").orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data();
      if (!pillarNeedsV2(data)) continue;
      const uid = String(data.userId ?? "");
      if (!uid) {
        errors.push({ id: doc.id, error: "missing userId" });
        continue;
      }
      queued++;
      const label = `${doc.id} name=${JSON.stringify(data.name)} userId=${uid}`;
      if (!apply) {
        console.log(`[dry-run] would migrate ${label}`);
        continue;
      }
      try {
        const result = await migrateLinkedDriveToFolderModelV2(db, uid, doc.id);
        migrated++;
        console.log(`[apply] migrated ${label} ${JSON.stringify(result)}`);
        if (limit != null && migrated >= limit) {
          console.log(
            JSON.stringify({ stopped: "limit", scanned, queued, migrated, errors: errors.length }, null, 2)
          );
          return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ id: doc.id, error: msg });
        console.error(`[error] ${label}: ${msg}`);
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        scanned,
        legacyPillarDrives: queued,
        migrated: apply ? migrated : 0,
        errors,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
