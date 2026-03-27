/**
 * One-time / rollout: set missing backup_files.lifecycle_state from legacy deleted_at.
 *
 * Run: DOTENV_CONFIG_PATH=.env.local npx ts-node -r ./scripts/register-paths.js \
 *   --compiler-options '{"module":"CommonJS","esModuleInterop":true}' -r dotenv/config \
 *   scripts/backfill-backup-files-lifecycle.ts [--dry-run]
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local.
 */
import * as fs from "fs";
import * as path from "path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type {
  DocumentReference,
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {
  backupFileNeedsLifecycleBackfill,
  resolveBackupFileLifecycleState,
} from "@/lib/backup-file-lifecycle";

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

const PAGE = 500;
const WRITE_BATCH = 450;

async function commitUpdates(
  db: Firestore,
  updates: Array<{ ref: DocumentReference; lifecycle_state: string }>,
  dryRun: boolean
): Promise<number> {
  if (updates.length === 0) return 0;
  if (dryRun) return updates.length;
  let n = 0;
  for (let i = 0; i < updates.length; i += WRITE_BATCH) {
    const chunk = updates.slice(i, i + WRITE_BATCH);
    const batch = db.batch();
    for (const u of chunk) {
      batch.update(u.ref, { lifecycle_state: u.lifecycle_state });
    }
    await batch.commit();
    n += chunk.length;
  }
  return n;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();

  let updated = 0;
  let scanned = 0;
  let last: QueryDocumentSnapshot | undefined;

  for (;;) {
    let q = db.collection("backup_files").orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    const toWrite: Array<{ ref: DocumentReference; lifecycle_state: string }> = [];
    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data() as Record<string, unknown>;
      if (!backupFileNeedsLifecycleBackfill(data)) continue;
      toWrite.push({
        ref: doc.ref,
        lifecycle_state: resolveBackupFileLifecycleState(data),
      });
    }

    updated += await commitUpdates(db, toWrite, dryRun);

    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE) break;
  }

  console.log(
    dryRun
      ? `[dry-run] Would update ${updated} docs (scanned ${scanned}).`
      : `Updated ${updated} docs (scanned ${scanned}).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
