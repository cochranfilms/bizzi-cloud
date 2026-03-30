/**
 * Propose and optionally set media_folder_segment on legacy galleries missing it.
 * Does not move B2 objects.
 *
 * Run (report only):
 *   DOTENV_CONFIG_PATH=.env.local npx ts-node -r ./scripts/register-paths.js \
 *     --compiler-options '{"module":"CommonJS","esModuleInterop":true}' -r dotenv/config \
 *     scripts/backfill-gallery-media-folder-segment.ts
 *
 * Apply updates:
 *   ... scripts/backfill-gallery-media-folder-segment.ts --apply
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local.
 */
import * as fs from "fs";
import * as path from "path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { ensureUniqueMediaFolderSegment } from "@/lib/gallery-media-folder-admin";

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

const PAGE = 300;

function normScope(d: Record<string, unknown>) {
  const photographerId = d.photographer_id as string;
  const organizationId =
    d.organization_id != null && String(d.organization_id).trim() !== ""
      ? String(d.organization_id).trim()
      : null;
  const personalTeamOwnerId =
    d.personal_team_owner_id != null && String(d.personal_team_owner_id).trim() !== ""
      ? String(d.personal_team_owner_id).trim()
      : null;
  return { photographerId, organizationId, personalTeamOwnerId };
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();

  let last: QueryDocumentSnapshot | undefined;
  let examined = 0;
  let wouldSet = 0;
  const manualReview: string[] = [];

  while (true) {
    let q = db.collection("galleries").orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      examined++;
      const d = doc.data();
      const existing = d.media_folder_segment;
      if (typeof existing === "string" && existing.trim()) continue;

      const title = typeof d.title === "string" ? d.title.trim() : "";
      if (!title) {
        manualReview.push(`${doc.id}: missing title`);
        continue;
      }

      const scope = normScope(d);
      if (!scope.photographerId) {
        manualReview.push(`${doc.id}: missing photographer_id`);
        continue;
      }

      const segment = await ensureUniqueMediaFolderSegment(db, scope, title, doc.id);
      console.log(`${apply ? "[apply]" : "[dry-run]"} ${doc.id} media_folder_segment=${segment}`);
      wouldSet++;
      if (apply) {
        await doc.ref.update({ media_folder_segment: segment });
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }

  console.log(
    JSON.stringify(
      { examined, proposedOrUpdated: wouldSet, manualReviewCount: manualReview.length },
      null,
      2
    )
  );
  if (manualReview.length) {
    console.log("Manual review:");
    for (const line of manualReview.slice(0, 50)) console.log(line);
    if (manualReview.length > 50) console.log(`... and ${manualReview.length - 50} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
