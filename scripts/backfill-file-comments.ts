/**
 * Backfill workspace fields on existing file_comments from backup_files.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' -r dotenv/config scripts/backfill-file-comments.ts
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function getServiceAccountJson(): string {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
  if (pathEnv) {
    const fullPath = path.resolve(process.cwd(), pathEnv);
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, "utf8");
    process.exit(1);
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return json;
  process.exit(1);
}

function deriveScope(fileData: Record<string, unknown>, authorUserId: string) {
  const userId = fileData.userId as string;
  const orgId = (fileData.organization_id as string | undefined) ?? null;
  const pto = (fileData.personal_team_owner_id as string | undefined) ?? null;
  let workspace_type: string;
  let workspace_id: string;
  if (orgId) {
    workspace_type = "organization";
    workspace_id = orgId;
  } else if (pto) {
    workspace_type = "team";
    workspace_id = pto;
  } else {
    workspace_type = "personal";
    workspace_id = userId;
  }
  const visibility_scope =
    orgId || pto ? "collaborators" : authorUserId === userId ? "owner_only" : "share_recipient";
  return {
    workspace_type,
    workspace_id,
    organization_id: orgId,
    personal_team_owner_id: pto,
    file_owner_id: userId,
    visibility_scope,
  };
}

async function main() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(getServiceAccountJson())) });
  }
  const db = getFirestore();
  const snap = await db.collection("file_comments").limit(500).get();
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.workspace_type) continue;
    const fileId = data.fileId as string;
    if (!fileId) continue;
    const fileSnap = await db.collection("backup_files").doc(fileId).get();
    if (!fileSnap.exists) continue;
    const authorUserId = data.authorUserId as string;
    const scope = deriveScope(fileSnap.data()!, authorUserId);
    await doc.ref.update({
      ...scope,
      file_owner_id: scope.file_owner_id,
    });
    updated += 1;
  }
  console.log(`Updated ${updated} comments (batch max 500; re-run until 0).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
