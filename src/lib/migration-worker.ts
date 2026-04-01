import { FieldValue, Timestamp, type Firestore, type DocumentReference } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getObjectMetadata, isB2Configured, getObjectBuffer } from "@/lib/b2";
import {
  MIGRATION_FILES_SUBCOLLECTION,
  MIGRATION_JOBS_COLLECTION,
  migrationMaxFilesPerJob,
  migrationMaxRetriesPerFile,
  type MigrationJobStatus,
  type MigrationUnsupportedReason,
} from "@/lib/migration-constants";
import {
  migrationDestinationStillValid,
  type MigrationDestinationContract,
} from "@/lib/migration-destination";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { getUploadBillingSnapshot } from "@/lib/enterprise-storage";
import {
  classifyGoogleDriveItem,
  googleDownloadFileMedia,
  googleListChildren,
} from "@/lib/migration-google-drive-api";
import {
  classifyDropboxItem,
  dropboxDownload,
  dropboxListFolder,
} from "@/lib/migration-dropbox-api";
import { getGoogleAccessToken, getDropboxAccessToken } from "@/lib/migration-provider-account";
import { runMigrationPreflightQuota } from "@/lib/migration-preflight-quota";
import { buildBackupObjectKey, sanitizeBackupRelativePath } from "@/lib/backup-object-key";
import { checkAndReserveUploadBytes } from "@/lib/storage-upload-reservation";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { streamWebBodyToB2Multipart } from "@/lib/migration-stream-to-b2";
import { finalizeMigrationBackupFile } from "@/lib/migration-finalize-backup-file";
import { resolveMigrationDuplicatePath } from "@/lib/migration-duplicate-path";
import {
  logMigrationJobCompleted,
  logMigrationJobFailed,
  logMigrationJobScanCompleted,
} from "@/lib/migration-log-activity";
import { createHash } from "crypto";

const LEASE_MS = 120_000;

type ScanQueueGoogle = { kind: "google"; folder_id: string; dest_prefix: string };
type ScanQueueDropbox = { kind: "dropbox"; path_lower: string; dest_prefix: string };
type ScanQueueEntry = ScanQueueGoogle | ScanQueueDropbox;

async function actorHasWriteAccess(
  db: Firestore,
  uid: string,
  contract: MigrationDestinationContract
): Promise<boolean> {
  try {
    if (contract.workspace_id) {
      return userCanWriteWorkspace(uid, contract.workspace_id);
    }
    await getUploadBillingSnapshot(uid, contract.linked_drive_id);
    return true;
  } catch {
    return false;
  }
}

async function failJob(
  jobRef: DocumentReference,
  code: string,
  message: string,
  status: MigrationJobStatus,
  ctx: { uid: string; contract: MigrationDestinationContract }
): Promise<void> {
  await jobRef.update({
    status,
    failure_code: code,
    failure_message: message,
    updated_at: FieldValue.serverTimestamp(),
    lease_expires_at: null,
  });
  logMigrationJobFailed(ctx.uid, ctx.contract, jobRef.id, {
    failure_code: code,
    failure_message: message,
    status,
  });
}

async function finishScanAndPreflight(
  jobRef: DocumentReference,
  contract: MigrationDestinationContract,
  uid: string
): Promise<void> {
  const all = await jobRef.collection(MIGRATION_FILES_SUBCOLLECTION).get();
  let bytesSupported = 0;
  let filesSupported = 0;
  let filesUnsupported = 0;
  for (const d of all.docs) {
    const row = d.data();
    if (row.unsupported_reason === "supported") {
      filesSupported++;
      bytesSupported += typeof row.size_bytes === "number" ? row.size_bytes : 0;
    } else {
      filesUnsupported++;
    }
  }
  const preflight = await runMigrationPreflightQuota(contract, bytesSupported);
  const nextStatus: MigrationJobStatus = preflight.ok ? "ready" : "blocked_quota";
  await jobRef.update({
    status: nextStatus,
    scan_completed_at: new Date().toISOString(),
    files_supported_count: filesSupported,
    files_unsupported_count: filesUnsupported,
    bytes_supported_estimate: bytesSupported,
    preflight_quota: { ...preflight },
    preflight_blocked: !preflight.ok,
    updated_at: FieldValue.serverTimestamp(),
    lease_expires_at: null,
  });
  logMigrationJobScanCompleted(uid, contract, jobRef.id, {
    status: nextStatus,
    files_supported_count: filesSupported,
    files_unsupported_count: filesUnsupported,
    preflight_ok: preflight.ok,
  });
}

async function scanTickGoogle(
  db: Firestore,
  jobRef: DocumentReference,
  job: Record<string, unknown>,
  uid: string,
  contract: MigrationDestinationContract
): Promise<void> {
  const access = await getGoogleAccessToken(db, uid);
  let queue = [...((job.scan_queue as ScanQueueEntry[] | undefined) ?? [])];
  const pageTokens = { ...((job.google_page_tokens as Record<string, string> | undefined) ?? {}) };
  if (queue.length === 0) {
    await finishScanAndPreflight(jobRef, contract, uid);
    return;
  }
  const head = queue[0] as ScanQueueGoogle;
  if (head.kind !== "google") return;

  const folderId = head.folder_id;
  const destPrefix = head.dest_prefix;
  const token = pageTokens[folderId];
  const { files, nextPageToken } = await googleListChildren(access, folderId, token);

  let filesTotal = typeof job.files_total_scanned === "number" ? job.files_total_scanned : 0;
  let newFiles = 0;

  for (const f of files) {
    if (newFiles + filesTotal >= migrationMaxFilesPerJob()) {
      await failJob(jobRef, "MIGRATION_FILE_LIMIT", "Too many files in this migration job.", "failed", {
        uid,
        contract,
      });
      return;
    }
    if (f.mimeType === "application/vnd.google-apps.folder") {
      const childDest = destPrefix ? `${destPrefix}/${f.name}` : f.name;
      queue.push({
        kind: "google",
        folder_id: f.id,
        dest_prefix: sanitizeBackupRelativePath(childDest),
      });
      continue;
    }
    const cls = classifyGoogleDriveItem(f);
    const leafPath = destPrefix ? `${destPrefix}/${f.name}` : f.name;
    const safeLeaf = sanitizeBackupRelativePath(leafPath);
    const destRelative = contract.destination_path_prefix
      ? `${contract.destination_path_prefix}/${safeLeaf}`
      : safeLeaf;
    const sizeNum = f.size != null ? parseInt(f.size, 10) : 0;
    const reason: MigrationUnsupportedReason = cls.supported ? "supported" : cls.reason;
    await jobRef.collection(MIGRATION_FILES_SUBCOLLECTION).add({
      provider: "google_drive",
      provider_file_id: f.id,
      source_path_label: safeLeaf,
      dest_relative_path: destRelative,
      size_bytes: Number.isFinite(sizeNum) ? sizeNum : 0,
      mime_type: f.mimeType,
      unsupported_reason: reason,
      transfer_status: cls.supported ? "pending" : "skipped",
      retry_count: 0,
      provider_checksum_md5: f.md5Checksum ?? null,
      transfer_verification_status: "none",
      created_at: FieldValue.serverTimestamp(),
    });
    newFiles++;
    filesTotal++;
  }

  if (nextPageToken) {
    pageTokens[folderId] = nextPageToken;
  } else {
    delete pageTokens[folderId];
    queue = queue.slice(1);
  }

  await jobRef.update({
    scan_queue: queue,
    google_page_tokens: pageTokens,
    files_total_scanned: filesTotal,
    updated_at: FieldValue.serverTimestamp(),
  });

  if (queue.length === 0) {
    await finishScanAndPreflight(jobRef, contract, uid);
  }
}

async function scanTickDropbox(
  db: Firestore,
  jobRef: DocumentReference,
  job: Record<string, unknown>,
  uid: string,
  contract: MigrationDestinationContract
): Promise<void> {
  const access = await getDropboxAccessToken(db, uid);
  let queue = [...((job.scan_queue as ScanQueueEntry[] | undefined) ?? [])];
  const cursors = { ...((job.dropbox_list_cursors as Record<string, string> | undefined) ?? {}) };

  if (queue.length === 0) {
    await finishScanAndPreflight(jobRef, contract, uid);
    return;
  }
  const head = queue[0] as ScanQueueDropbox;
  if (head.kind !== "dropbox") return;

  const pathKey = head.path_lower;
  const destPrefix = head.dest_prefix;
  const cursor = cursors[pathKey];

  const list = await dropboxListFolder(access, pathKey, cursor);
  let filesTotal = typeof job.files_total_scanned === "number" ? job.files_total_scanned : 0;

  for (const ent of list.entries) {
    if (filesTotal >= migrationMaxFilesPerJob()) {
      await failJob(jobRef, "MIGRATION_FILE_LIMIT", "Too many files in this migration job.", "failed", {
        uid,
        contract,
      });
      return;
    }
    if (ent[".tag"] === "folder") {
      const childDest = destPrefix ? `${destPrefix}/${ent.name}` : ent.name;
      queue.push({
        kind: "dropbox",
        path_lower: ent.path_lower,
        dest_prefix: sanitizeBackupRelativePath(childDest),
      });
    } else {
      const cls = classifyDropboxItem(ent);
      const leafPath = destPrefix ? `${destPrefix}/${ent.name}` : ent.name;
      const safeLeaf = sanitizeBackupRelativePath(leafPath);
      const destRelative = contract.destination_path_prefix
        ? `${contract.destination_path_prefix}/${safeLeaf}`
        : safeLeaf;
      const reason: MigrationUnsupportedReason = cls.supported ? "supported" : cls.reason;
      await jobRef.collection(MIGRATION_FILES_SUBCOLLECTION).add({
        provider: "dropbox",
        provider_file_id: ent.id ?? ent.path_lower,
        source_path_label: safeLeaf,
        dest_relative_path: destRelative,
        size_bytes: typeof ent.size === "number" ? ent.size : 0,
        mime_type: "application/octet-stream",
        unsupported_reason: reason,
        transfer_status: cls.supported ? "pending" : "skipped",
        retry_count: 0,
        dropbox_path_lower: ent.path_lower,
        transfer_verification_status: "none",
        created_at: FieldValue.serverTimestamp(),
      });
      filesTotal++;
    }
  }

  if (list.has_more && list.cursor) {
    cursors[pathKey] = list.cursor;
  } else {
    delete cursors[pathKey];
    queue = queue.slice(1);
  }

  await jobRef.update({
    scan_queue: queue,
    dropbox_list_cursors: cursors,
    files_total_scanned: filesTotal,
    updated_at: FieldValue.serverTimestamp(),
  });

  if (queue.length === 0) {
    await finishScanAndPreflight(jobRef, contract, uid);
  }
}

async function transferOneFile(
  db: Firestore,
  jobRef: DocumentReference,
  job: Record<string, unknown>,
  uid: string,
  contract: MigrationDestinationContract,
  provider: string
): Promise<void> {
  const pending = await jobRef
    .collection(MIGRATION_FILES_SUBCOLLECTION)
    .where("transfer_status", "==", "pending")
    .limit(40)
    .get();

  const docToSend = pending.docs.find((d) => String(d.data().unsupported_reason ?? "") === "supported");
  if (!docToSend) {
    const anyPending = await jobRef.collection(MIGRATION_FILES_SUBCOLLECTION).where("transfer_status", "==", "pending").limit(1).get();
    if (anyPending.empty) {
      await jobRef.update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: FieldValue.serverTimestamp(),
        lease_expires_at: null,
      });
      logMigrationJobCompleted(uid, contract, jobRef.id);
    }
    return;
  }

  const fileRef = docToSend.ref;
  const f = docToSend.data();
  const dupMode = (job.duplicate_mode as "skip" | "rename") ?? "skip";

  await fileRef.update({ transfer_status: "in_progress", updated_at: FieldValue.serverTimestamp() });

  const driveSnap = await db.collection("linked_drives").doc(contract.linked_drive_id).get();
  const destRelativeRaw = (f.dest_relative_path as string) ?? "";
  const dup = await resolveMigrationDuplicatePath(
    db,
    contract.linked_drive_id,
    destRelativeRaw,
    dupMode
  );
  if (dup.action === "skip") {
    await fileRef.update({
      transfer_status: "skipped",
      duplicate_skipped: true,
      updated_at: FieldValue.serverTimestamp(),
    });
    return;
  }
  const relativePath = dup.relative_path;
  const objectKey = buildBackupObjectKey({
    pathSubjectUid: contract.path_subject_uid,
    driveId: contract.linked_drive_id,
    relativePath,
  });

  const sizeBytes = typeof f.size_bytes === "number" ? f.size_bytes : 0;
  let reservationId: string | null = null;
  try {
    const r = await checkAndReserveUploadBytes(uid, sizeBytes, contract.linked_drive_id, objectKey);
    reservationId = r.reservation_id;
  } catch (e) {
    await fileRef.update({
      transfer_status: "failed",
      last_error: e instanceof Error ? e.message : "quota_or_reserve_failed",
      updated_at: FieldValue.serverTimestamp(),
    });
    return;
  }

  let contentType = (f.mime_type as string) || "application/octet-stream";
  try {
    if (provider === "google_drive") {
      const access = await getGoogleAccessToken(db, uid);
      const fileId = f.provider_file_id as string;
      const res = await googleDownloadFileMedia(access, fileId);
      if (!res.ok) {
        throw new Error(`google_download_${res.status}`);
      }
      const cl = res.headers.get("content-length");
      const contentLength = cl ? parseInt(cl, 10) : null;
      const body = res.body;
      const ct = res.headers.get("content-type");
      if (ct) contentType = ct.split(";")[0]!.trim();
      await streamWebBodyToB2Multipart({
        objectKey,
        contentType,
        contentLength: Number.isFinite(contentLength!) ? contentLength : null,
        body,
      });
    } else {
      const access = await getDropboxAccessToken(db, uid);
      const pathLower = (f.dropbox_path_lower as string) ?? "";
      const res = await dropboxDownload(access, pathLower);
      if (!res.ok) {
        throw new Error(`dropbox_download_${res.status}`);
      }
      const cl = res.headers.get("content-length");
      const contentLength = cl ? parseInt(cl, 10) : null;
      const body = res.body;
      await streamWebBodyToB2Multipart({
        objectKey,
        contentType,
        contentLength: Number.isFinite(contentLength!) ? contentLength : null,
        body,
      });
    }

    const meta = await getObjectMetadata(objectKey);
    const actual = meta?.contentLength ?? -1;
    if (actual !== sizeBytes && sizeBytes > 0) {
      if (reservationId) await releaseReservation(reservationId, "size_mismatch").catch(() => {});
      throw new Error("size_mismatch_after_upload");
    }

    let verification: "size_ok" | "checksum_ok" | "checksum_mismatch" = "size_ok";
    const md5Expected = f.provider_checksum_md5 as string | undefined;
    if (
      md5Expected &&
      /^[a-f0-9]{32}$/i.test(md5Expected) &&
      sizeBytes > 0 &&
      sizeBytes <= 50 * 1024 * 1024
    ) {
      const buf = await getObjectBuffer(objectKey, 50 * 1024 * 1024);
      const h = createHash("md5").update(buf).digest("hex");
      verification =
        h.toLowerCase() === md5Expected.toLowerCase() ? "checksum_ok" : "checksum_mismatch";
    }

    const { backup_file_id } = await finalizeMigrationBackupFile({
      db,
      uid,
      driveId: contract.linked_drive_id,
      driveSnap,
      objectKey,
      relativePath,
      fileSize: actual >= 0 ? actual : sizeBytes,
      contentType,
      organizationId: contract.organization_id,
      workspaceId: contract.workspace_id,
      visibilityScope: contract.visibility_scope,
      reservationId,
      appOrigin: null,
      idToken: null,
    });

    await fileRef.update({
      transfer_status: "completed",
      backup_file_id,
      backup_file_object_key: objectKey,
      transfer_verification_status: verification,
      updated_at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (reservationId) await releaseReservation(reservationId, "finalize_failed").catch(() => {});
    const retryCount = (typeof f.retry_count === "number" ? f.retry_count : 0) + 1;
    const terminal = retryCount >= migrationMaxRetriesPerFile();
    await fileRef.update({
      transfer_status: terminal ? "failed" : "pending",
      last_error: err instanceof Error ? err.message : "transfer_failed",
      retry_count: retryCount,
      updated_at: FieldValue.serverTimestamp(),
    });
  }
}

export async function runMigrationWorkerOnce(db: Firestore): Promise<{ claimed: boolean }> {
  if (!isB2Configured()) {
    return { claimed: false };
  }

  const now = Date.now();
  const snap = await db
    .collection(MIGRATION_JOBS_COLLECTION)
    .where("status", "in", ["scanning", "running"])
    .limit(12)
    .get();

  const candidates: QueryDocumentSnapshot[] = [];
  for (const d of snap.docs) {
    const row = d.data();
    if (row.pause_requested === true) continue;
    const lease = row.lease_expires_at as Timestamp | null | undefined;
    if (lease && lease.toMillis() > now) continue;
    candidates.push(d);
  }
  if (candidates.length === 0) {
    return { claimed: false };
  }

  const doc = candidates[0]!;
  const jobRef = doc.ref;

  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(jobRef);
      const row = fresh.data();
      if (!row) throw new Error("gone");
      if (row.pause_requested === true) throw new Error("paused");
      const st = row.status as string;
      if (st !== "scanning" && st !== "running") throw new Error("not_active");
      const lease = row.lease_expires_at as Timestamp | null | undefined;
      if (lease && lease.toMillis() > Date.now()) throw new Error("leased");
      tx.update(jobRef, {
        lease_expires_at: Timestamp.fromMillis(Date.now() + LEASE_MS),
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  } catch {
    return { claimed: false };
  }

  const job = (await jobRef.get()).data()!;
  const uid = job.user_id as string;
  const contract = job.destination_contract as MigrationDestinationContract;

  const validDest = await migrationDestinationStillValid(db, contract);
  if (!validDest.ok) {
    await failJob(
      jobRef,
      "destination_invalidated",
      validDest.message,
      "blocked_destination_invalid",
      { uid, contract }
    );
    return { claimed: true };
  }
  const accessOk = await actorHasWriteAccess(db, uid, contract);
  if (!accessOk) {
    await failJob(
      jobRef,
      "permission_revoked",
      "You no longer have access to this destination.",
      "failed",
      { uid, contract }
    );
    return { claimed: true };
  }

  const status = job.status as string;
  const provider = job.provider as string;

  try {
    if (status === "scanning") {
      if (provider === "google_drive") {
        await scanTickGoogle(db, jobRef, job, uid, contract);
      } else {
        await scanTickDropbox(db, jobRef, job, uid, contract);
      }
    } else if (status === "running") {
      await transferOneFile(db, jobRef, job, uid, contract, provider);
    }
  } finally {
    await jobRef.update({ lease_expires_at: null, updated_at: FieldValue.serverTimestamp() }).catch(() => {});
  }

  return { claimed: true };
}
