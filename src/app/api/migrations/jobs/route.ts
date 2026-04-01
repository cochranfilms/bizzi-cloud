import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_JOBS_COLLECTION, type MigrationDuplicateMode, type MigrationProvider } from "@/lib/migration-constants";
import { resolveMigrationDestinationContract } from "@/lib/migration-destination";
import { assertMigrationJobLimits } from "@/lib/migration-job-guards";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import { sanitizeBackupRelativePath } from "@/lib/backup-object-key";
import { checkRateLimit } from "@/lib/rate-limit";
import { logMigrationJobCreated } from "@/lib/migration-log-activity";

type SourceEntry = { ref: string; label: string; kind?: "folder" | "file" };

export async function POST(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`migration_jobs_create:${auth.uid}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", code: "rate_limited" }, { status: 429 });
  }

  let body: {
    provider?: MigrationProvider;
    duplicate_mode?: MigrationDuplicateMode;
    drive_id?: string;
    workspace_id?: string | null;
    destination_path_prefix?: string;
    sources?: SourceEntry[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = body.provider;
  if (provider !== "google_drive" && provider !== "dropbox") {
    return NextResponse.json({ error: "Invalid provider", code: "invalid_provider" }, { status: 400 });
  }
  const duplicate_mode = body.duplicate_mode === "rename" ? "rename" : "skip";
  const driveId = body.drive_id?.trim();
  if (!driveId) {
    return NextResponse.json({ error: "drive_id required", code: "missing_drive" }, { status: 400 });
  }
  const workspaceId =
    body.workspace_id != null && String(body.workspace_id).trim()
      ? String(body.workspace_id).trim()
      : null;
  const destination_path_prefix = sanitizeBackupRelativePath(body.destination_path_prefix ?? "");
  const sources = Array.isArray(body.sources) ? body.sources : [];
  if (sources.length === 0) {
    return NextResponse.json({ error: "sources required", code: "missing_sources" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const resolved = await resolveMigrationDestinationContract(db, {
    uid: auth.uid,
    driveId,
    destinationPathPrefix: destination_path_prefix,
    workspaceId,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.message, code: resolved.code },
      { status: resolved.status }
    );
  }

  const limits = await assertMigrationJobLimits(db, auth.uid, workspaceId, sources.length);
  if (!limits.ok) {
    return NextResponse.json(
      { error: limits.message, code: limits.code },
      { status: limits.status }
    );
  }

  const contract = resolved.contract;
  const scan_queue =
    provider === "google_drive"
      ? sources.map((s) =>
          s.kind === "file"
            ? ({
                kind: "google_file" as const,
                file_id: s.ref,
                dest_prefix: "",
              } as const)
            : ({
                kind: "google" as const,
                folder_id: s.ref,
                dest_prefix: sanitizeBackupRelativePath(s.label || "imported"),
              } as const)
        )
      : sources.map((s) =>
          s.kind === "file"
            ? ({
                kind: "dropbox_file" as const,
                path_lower: s.ref,
                dest_prefix: "",
              } as const)
            : ({
                kind: "dropbox" as const,
                path_lower: s.ref,
                dest_prefix: sanitizeBackupRelativePath(s.label || "imported"),
              } as const)
        );

  const ref = await db.collection(MIGRATION_JOBS_COLLECTION).add({
    user_id: auth.uid,
    provider,
    duplicate_mode,
    destination_contract: contract,
    migration_workspace_id: workspaceId,
    scan_queue,
    google_page_tokens: {},
    dropbox_list_cursors: {},
    files_total_scanned: 0,
    status: "scanning",
    pause_requested: false,
    failure_code: null,
    failure_message: null,
    preflight_blocked: false,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  logMigrationJobCreated(auth.uid, contract, ref.id, provider);

  return NextResponse.json({ job_id: ref.id });
}

export async function GET(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();
  const snap = await db
    .collection(MIGRATION_JOBS_COLLECTION)
    .where("user_id", "==", auth.uid)
    .limit(30)
    .get();

  const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ jobs });
}
