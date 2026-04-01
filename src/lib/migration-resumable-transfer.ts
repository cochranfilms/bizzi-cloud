/**
 * Resumable migration transfer: checkpointed multipart, file claims, part subcollection, Google Range reads.
 */

import { createHash, randomBytes } from "crypto";
import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { buildBackupObjectKey } from "@/lib/backup-object-key";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  computeAdaptivePartPlan,
  createMultipartUpload,
  getObjectBuffer,
  getObjectMetadata,
  listMultipartUploadParts,
  uploadMultipartPartServerSide,
} from "@/lib/b2";
import {
  googleBuildSourceFingerprint,
  googleDownloadFileMedia,
  googleDownloadFileMediaRange,
  googleGetFileMeta,
  googleSourceFingerprintChanged,
  type GoogleDriveSourceFingerprint,
} from "@/lib/migration-google-drive-api";
import {
  MIGRATION_FILES_PARTS_SUBCOLLECTION,
  migrationFileClaimMs,
  migrationMaxPartsPerPass,
  migrationMaxRetriesPerFile,
  migrationResumableThresholdBytes,
  migrationTransferBudgetMs,
  type MigrationFileTransferStatus,
  type MigrationTransferSessionResult,
  type MigrationTransferSessionWorkerState,
} from "@/lib/migration-constants";
import type { MigrationDestinationContract } from "@/lib/migration-destination";
import { finalizeMigrationBackupFile } from "@/lib/migration-finalize-backup-file";
import { resolveMigrationDuplicatePath } from "@/lib/migration-duplicate-path";
import { dropboxDownload } from "@/lib/migration-dropbox-api";
import { getDropboxAccessToken, getGoogleAccessToken } from "@/lib/migration-provider-account";
import { checkAndReserveUploadBytes } from "@/lib/storage-upload-reservation";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { streamWebBodyToB2Multipart } from "@/lib/migration-stream-to-b2";

const B2_PART_MIN = 5 * 1024 * 1024;

export type MigrationPartCheckpoint = {
  part_number: number;
  etag: string;
  size_bytes: number;
  byte_start: number;
  byte_end: number;
  uploaded_at: Timestamp;
};

export interface TransferSessionDoc {
  schema_version: number;
  session_id: string;
  result: MigrationTransferSessionResult;
  state: MigrationTransferSessionWorkerState;
  transport: "resumable_multipart" | "single_pass_stream";
  provider: "google_drive" | "dropbox";
  b2_upload_id: string | null;
  b2_object_key: string | null;
  content_type: string | null;
  duplicate_resolution: "write" | "skip" | null;
  size_bytes_expected: number;
  part_size_bytes: number | null;
  parts_total: number | null;
  source_fingerprint: GoogleDriveSourceFingerprint | null;
}

export function buildMigrationFinalizeKey(jobId: string, fileId: string, sessionId: string): string {
  return `${jobId}:${fileId}:${sessionId}`;
}

export function planPartsRemainingForBudget(params: {
  partsAlreadyUploadedThisPass: number;
  maxPerPass: number;
}): boolean {
  return params.partsAlreadyUploadedThisPass < params.maxPerPass;
}

/** Exported for tests — validates non-overlapping cover [0, sizeExpected). */
export function verifyPartContinuityAndTotals(
  parts: { partNumber: number; size_bytes: number; byte_start: number; byte_end: number }[],
  sizeExpected: number
): { ok: true } | { ok: false; error: string } {
  if (sizeExpected === 0) {
    if (parts.length > 0) return { ok: false, error: "expected_no_parts" };
    return { ok: true };
  }
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  if (sorted.length === 0) return { ok: false, error: "no_parts" };
  if (sorted[0]!.partNumber !== 1) return { ok: false, error: "part_gap_start" };
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.partNumber !== i + 1) return { ok: false, error: "part_gap" };
  }
  let expectedStart = 0;
  for (const p of sorted) {
    if (p.byte_start !== expectedStart) return { ok: false, error: "byte_gap" };
    if (p.byte_end < p.byte_start) return { ok: false, error: "bad_range" };
    const len = p.byte_end - p.byte_start + 1;
    if (len !== p.size_bytes) return { ok: false, error: "size_mismatch_row" };
    expectedStart = p.byte_end + 1;
  }
  if (expectedStart !== sizeExpected) return { ok: false, error: "incomplete_cover" };
  if (sorted.length > 1) {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i]!.size_bytes < B2_PART_MIN) return { ok: false, error: "part_too_small" };
    }
  }
  return { ok: true };
}

async function loadPartRows(
  fileRef: DocumentReference
): Promise<{ partNumber: number; size_bytes: number; byte_start: number; byte_end: number; etag: string }[]> {
  const snap = await fileRef.collection(MIGRATION_FILES_PARTS_SUBCOLLECTION).get();
  const out: { partNumber: number; size_bytes: number; byte_start: number; byte_end: number; etag: string }[] = [];
  for (const d of snap.docs) {
    const row = d.data();
    out.push({
      partNumber: typeof row.part_number === "number" ? row.part_number : parseInt(d.id, 10),
      size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : 0,
      byte_start: typeof row.byte_start === "number" ? row.byte_start : 0,
      byte_end: typeof row.byte_end === "number" ? row.byte_end : 0,
      etag: typeof row.etag === "string" ? row.etag : "",
    });
  }
  return out;
}

async function reconcilePartsFromB2(
  objectKey: string,
  uploadId: string,
  fileRef: DocumentReference,
  sizeExpected: number,
  partSize: number
): Promise<void> {
  const listed = await listMultipartUploadParts(objectKey, uploadId);
  if (listed.length === 0) return;
  const totalParts = Math.max(1, Math.ceil(sizeExpected / partSize));
  for (const p of listed) {
    const pn = p.PartNumber;
    const etag = String(p.ETag).replace(/^"|"$/g, "");
    const byteStart = (pn - 1) * partSize;
    const isLast = pn === totalParts;
    const byteEnd = isLast ? sizeExpected - 1 : byteStart + partSize - 1;
    const sz = byteEnd - byteStart + 1;
    await fileRef.collection(MIGRATION_FILES_PARTS_SUBCOLLECTION).doc(String(pn)).set(
      {
        part_number: pn,
        etag,
        size_bytes: sz,
        byte_start: byteStart,
        byte_end: byteEnd,
        uploaded_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  const rows = await loadPartRows(fileRef);
  const maxEnd = rows.length ? Math.max(...rows.map((r) => r.byte_end)) + 1 : 0;
  const nextByte = Math.min(sizeExpected, maxEnd);
  await fileRef.update({
    parts_completed: rows.length,
    next_byte: nextByte,
    bytes_transferred: nextByte,
    checkpoint_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
}

function sessionFromData(data: Record<string, unknown>): TransferSessionDoc | null {
  const ts = data.transfer_session as Record<string, unknown> | undefined;
  if (!ts || typeof ts !== "object") return null;
  return {
    schema_version: typeof ts.schema_version === "number" ? ts.schema_version : 1,
    session_id: String(ts.session_id ?? ""),
    result: (ts.result as MigrationTransferSessionResult) ?? "active",
    state: (ts.state as MigrationTransferSessionWorkerState) ?? "session_initializing",
    transport: (ts.transport as TransferSessionDoc["transport"]) ?? "single_pass_stream",
    provider: (ts.provider as TransferSessionDoc["provider"]) ?? "google_drive",
    b2_upload_id: typeof ts.b2_upload_id === "string" ? ts.b2_upload_id : null,
    b2_object_key: typeof ts.b2_object_key === "string" ? ts.b2_object_key : null,
    content_type: typeof ts.content_type === "string" ? ts.content_type : null,
    duplicate_resolution: (ts.duplicate_resolution as TransferSessionDoc["duplicate_resolution"]) ?? null,
    size_bytes_expected: typeof ts.size_bytes_expected === "number" ? ts.size_bytes_expected : 0,
    part_size_bytes: typeof ts.part_size_bytes === "number" ? ts.part_size_bytes : null,
    parts_total: typeof ts.parts_total === "number" ? ts.parts_total : null,
    source_fingerprint: (ts.source_fingerprint as GoogleDriveSourceFingerprint) ?? null,
  };
}

export async function claimMigrationFileTransfer(
  db: Firestore,
  jobRef: DocumentReference,
  fileRef: DocumentReference
): Promise<{ ok: true; claimToken: string } | { ok: false; reason: string }> {
  const claimMs = migrationFileClaimMs();
  const claimToken = randomBytes(12).toString("hex");
  try {
    await db.runTransaction(async (tx) => {
      const jobSnap = await tx.get(jobRef);
      const job = jobSnap.data();
      if (!job || String(job.status) !== "running" || job.pause_requested === true) {
        throw new Error("job_not_running");
      }
      const fileSnap = await tx.get(fileRef);
      const data = fileSnap.data();
      if (!data) throw new Error("no_file");
      const st = String(data.transfer_status ?? "");
      const terminal = st === "completed" || st === "failed" || st === "skipped";
      if (terminal) throw new Error("file_terminal");
      const sess = sessionFromData(data as Record<string, unknown>);
      if (sess && sess.result !== "active") throw new Error("session_not_active");
      const exp = data.transfer_claim_expires_at as Timestamp | undefined;
      if (exp && exp.toMillis() > Date.now()) throw new Error("already_claimed");
      tx.update(fileRef, {
        transfer_claim_token: claimToken,
        transfer_claim_expires_at: Timestamp.fromMillis(Date.now() + claimMs),
        updated_at: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, claimToken };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "claim_failed";
    return { ok: false, reason: msg };
  }
}

export async function releaseMigrationFileClaim(fileRef: DocumentReference): Promise<void> {
  await fileRef
    .update({
      transfer_claim_token: null,
      transfer_claim_expires_at: null,
      updated_at: FieldValue.serverTimestamp(),
    })
    .catch(() => {});
}

async function failFileTransfer(
  fileRef: DocumentReference,
  data: Record<string, unknown>,
  opts: {
    reservationId: string | null;
    objectKey: string | null;
    uploadId: string | null;
    code: string;
    detail: string;
    sessionPatch?: Partial<TransferSessionDoc>;
  }
): Promise<void> {
  if (opts.uploadId && opts.objectKey) {
    await abortMultipartUpload(opts.objectKey, opts.uploadId).catch(() => {});
  }
  if (opts.reservationId) await releaseReservation(opts.reservationId, "finalize_failed").catch(() => {});
  const retryCount = (typeof data.retry_count === "number" ? data.retry_count : 0) + 1;
  const terminal = retryCount >= migrationMaxRetriesPerFile();
  const prevSession = sessionFromData(data);
  const transfer_session =
    terminal && prevSession
      ? {
          ...prevSession,
          ...((opts.sessionPatch ?? {}) as Partial<TransferSessionDoc>),
          result: "failed" as const,
        }
      : FieldValue.delete();
  await fileRef.update({
    transfer_status: terminal ? "failed" : "pending",
    retry_count: retryCount,
    last_error_code: opts.code,
    last_error_detail: opts.detail,
    last_error: opts.detail,
    transfer_session,
    migration_finalize_key: terminal ? data.migration_finalize_key : FieldValue.delete(),
    quota_reservation_id: null,
    next_byte: terminal ? data.next_byte : 0,
    bytes_transferred: terminal ? data.bytes_transferred : 0,
    parts_completed: terminal ? data.parts_completed : 0,
    parts_total: terminal ? data.parts_total : null,
    transfer_claim_token: null,
    transfer_claim_expires_at: null,
    updated_at: FieldValue.serverTimestamp(),
  });
  if (!terminal) {
    await deleteMigrationPartsSubcollectionBestEffort(fileRef);
  }
}

/** Best-effort cleanup of `parts/*` (paged callers may repeat). */
export async function deleteMigrationPartsSubcollectionBestEffort(
  fileRef: DocumentReference
): Promise<void> {
  const snap = await fileRef.collection(MIGRATION_FILES_PARTS_SUBCOLLECTION).limit(500).get();
  if (snap.empty) return;
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

export async function runMigrationFileTransferPass(params: {
  db: Firestore;
  jobId: string;
  jobRef: DocumentReference;
  fileRef: DocumentReference;
  fileSnap: QueryDocumentSnapshot;
  uid: string;
  contract: MigrationDestinationContract;
  provider: "google_drive" | "dropbox";
  dupMode: "skip" | "rename";
  driveSnap: DocumentSnapshot;
}): Promise<void> {
  const { db, jobId, jobRef, fileRef, fileSnap, uid, contract, provider, dupMode, driveSnap } = params;
  let f = fileSnap.data() as Record<string, unknown>;
  let reservationId: string | null =
    typeof f.quota_reservation_id === "string" ? f.quota_reservation_id : null;
  const claim = await claimMigrationFileTransfer(db, jobRef, fileRef);
  if (!claim.ok) return;

  const fresh = await fileRef.get();
  f = fresh.data() as Record<string, unknown>;

  if (String(f.transfer_status) === "completed" && f.backup_file_id) {
    await releaseMigrationFileClaim(fileRef);
    return;
  }

  try {
    if (
      ["in_progress", "session_initializing", "verifying", "finalizing"].includes(
        String(f.transfer_status)
      ) &&
      !sessionFromData(f)
    ) {
      await fileRef.update({
        transfer_status: "pending",
        transfer_claim_token: null,
        transfer_claim_expires_at: null,
        updated_at: FieldValue.serverTimestamp(),
      });
      return;
    }

    if (String(f.transfer_status) === "needs_repair") {
      await repairIncompleteFinalization({
        db,
        fileRef,
        f,
        uid,
        contract,
        driveSnap,
      });
      await releaseMigrationFileClaim(fileRef);
      return;
    }

    const destRelativeRaw = (f.dest_relative_path as string) ?? "";
    let requestedPath = typeof f.requested_relative_path === "string" ? f.requested_relative_path : "";

    if (String(f.transfer_status) === "pending" && !f.transfer_session) {
      requestedPath = destRelativeRaw;
      const dup = await resolveMigrationDuplicatePath(db, contract.linked_drive_id, destRelativeRaw, dupMode);
      if (dup.action === "skip") {
        await fileRef.update({
          transfer_status: "skipped",
          duplicate_skipped: true,
          requested_relative_path: requestedPath,
          resolved_relative_path: null,
          updated_at: FieldValue.serverTimestamp(),
          transfer_claim_token: null,
          transfer_claim_expires_at: null,
          transfer_session: FieldValue.delete(),
        });
        return;
      }
      const relativePath = dup.relative_path;
      const objectKey = buildBackupObjectKey({
        pathSubjectUid: contract.path_subject_uid,
        driveId: contract.linked_drive_id,
        relativePath,
      });
      const sessionId = randomBytes(16).toString("hex");
      const migrationFinalizeKey = buildMigrationFinalizeKey(jobId, fileRef.id, sessionId);
      let sizeBytes = typeof f.size_bytes === "number" ? f.size_bytes : 0;
      let contentType = (f.mime_type as string) || "application/octet-stream";
      let fingerprint: GoogleDriveSourceFingerprint | null = null;

      if (provider === "google_drive") {
        const access = await getGoogleAccessToken(db, uid);
        const gmeta = await googleGetFileMeta(access, f.provider_file_id as string);
        fingerprint = googleBuildSourceFingerprint(gmeta);
        const sz = gmeta.size != null ? parseInt(gmeta.size, 10) : NaN;
        if (Number.isFinite(sz)) sizeBytes = sz;
        if (gmeta.mimeType) contentType = gmeta.mimeType.split(";")[0]!.trim();
      }

      let r: { reservation_id: string | null };
      try {
        r = await checkAndReserveUploadBytes(uid, sizeBytes, contract.linked_drive_id, objectKey);
        reservationId = r.reservation_id;
      } catch (e) {
        await fileRef.update({
          transfer_status: "failed",
          last_error: e instanceof Error ? e.message : "quota_or_reserve_failed",
          last_error_code: "quota_or_reserve_failed",
          last_error_detail: e instanceof Error ? e.message : "quota_or_reserve_failed",
          transfer_claim_token: null,
          transfer_claim_expires_at: null,
          updated_at: FieldValue.serverTimestamp(),
        });
        return;
      }

      const plan = computeAdaptivePartPlan(sizeBytes);
      const threshold = migrationResumableThresholdBytes();
      const useResumable =
        provider === "google_drive" && sizeBytes > 0 && sizeBytes >= threshold;

      const baseSession: TransferSessionDoc = {
        schema_version: 1,
        session_id: sessionId,
        result: "active",
        state: "session_initializing",
        transport: useResumable ? "resumable_multipart" : "single_pass_stream",
        provider: provider === "google_drive" ? "google_drive" : "dropbox",
        b2_upload_id: null,
        b2_object_key: objectKey,
        content_type: contentType,
        duplicate_resolution: "write",
        size_bytes_expected: sizeBytes,
        part_size_bytes: useResumable ? plan.partSize : null,
        parts_total: useResumable ? plan.totalParts : null,
        source_fingerprint: fingerprint,
      };

      await fileRef.update({
        transfer_status: "session_initializing",
        requested_relative_path: requestedPath,
        resolved_relative_path: relativePath,
        migration_finalize_key: migrationFinalizeKey,
        quota_reservation_id: reservationId,
        transfer_session: baseSession as unknown as DocumentData,
        bytes_transferred: 0,
        next_byte: 0,
        parts_completed: 0,
        parts_total: useResumable ? plan.totalParts : null,
        transfer_started_at: new Date().toISOString(),
        checkpoint_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        size_bytes: sizeBytes,
      });

      f = (await fileRef.get()).data() as Record<string, unknown>;

      if (useResumable) {
        const { uploadId } = await createMultipartUpload(objectKey, contentType);
        await fileRef.update({
          transfer_status: "in_progress",
          transfer_session: {
            ...baseSession,
            state: "uploading" as const,
            b2_upload_id: uploadId,
          } as unknown as DocumentData,
          updated_at: FieldValue.serverTimestamp(),
          checkpoint_at: FieldValue.serverTimestamp(),
        });
        f = (await fileRef.get()).data() as Record<string, unknown>;
        await runResumableGooglePartLoop({
          db,
          fileRef,
          f,
          uid,
          contract,
          driveSnap,
        });
      } else {
        await runSinglePassStream({
          db,
          fileRef,
          f,
          uid,
          contract,
          provider,
          driveSnap,
        });
      }
      return;
    }

    let sess = sessionFromData(f);
    if (
      sess &&
      sess.transport === "resumable_multipart" &&
      sess.result === "active" &&
      provider === "google_drive" &&
      !sess.b2_upload_id &&
      sess.b2_object_key &&
      sess.content_type &&
      ["session_initializing", "in_progress"].includes(String(f.transfer_status))
    ) {
      if (sess.source_fingerprint) {
        const access = await getGoogleAccessToken(db, uid);
        const gmeta = await googleGetFileMeta(access, f.provider_file_id as string);
        const freshFp = googleBuildSourceFingerprint(gmeta);
        if (googleSourceFingerprintChanged(sess.source_fingerprint, freshFp)) {
          await failFileTransfer(fileRef, f, {
            reservationId: typeof f.quota_reservation_id === "string" ? f.quota_reservation_id : null,
            objectKey: sess.b2_object_key,
            uploadId: null,
            code: "source_file_changed",
            detail: "Google Drive file metadata changed during transfer",
            sessionPatch: { source_fingerprint: freshFp },
          });
          return;
        }
      }
      const { uploadId } = await createMultipartUpload(sess.b2_object_key, sess.content_type);
      await fileRef.update({
        transfer_status: "in_progress",
        transfer_session: {
          ...(f.transfer_session as Record<string, unknown>),
          b2_upload_id: uploadId,
          state: "uploading",
        } as unknown as DocumentData,
        updated_at: FieldValue.serverTimestamp(),
        checkpoint_at: FieldValue.serverTimestamp(),
      });
      f = (await fileRef.get()).data() as Record<string, unknown>;
      sess = sessionFromData(f);
    }

    if (
      sess &&
      sess.transport === "resumable_multipart" &&
      sess.result === "active" &&
      provider === "google_drive"
    ) {
      if (
        sess.source_fingerprint &&
        sess.b2_object_key &&
        sess.b2_upload_id &&
        sess.part_size_bytes
      ) {
        const access = await getGoogleAccessToken(db, uid);
        const gmeta = await googleGetFileMeta(access, f.provider_file_id as string);
        const freshFp = googleBuildSourceFingerprint(gmeta);
        if (googleSourceFingerprintChanged(sess.source_fingerprint, freshFp)) {
          await failFileTransfer(fileRef, f, {
            reservationId,
            objectKey: sess.b2_object_key,
            uploadId: sess.b2_upload_id,
            code: "source_file_changed",
            detail: "Google Drive file metadata changed during transfer",
            sessionPatch: { source_fingerprint: freshFp },
          });
          return;
        }
      }
      await runResumableGooglePartLoop({
        db,
        fileRef,
        f,
        uid,
        contract,
        driveSnap,
      });
      return;
    }

    if (sess && sess.transport === "single_pass_stream" && sess.result === "active") {
      await runSinglePassStream({
        db,
        fileRef,
        f,
        uid,
        contract,
        provider,
        driveSnap,
      });
    }
  } finally {
    await releaseMigrationFileClaim(fileRef).catch(() => {});
  }
}

async function runResumableGooglePartLoop(params: {
  db: Firestore;
  fileRef: DocumentReference;
  f: Record<string, unknown>;
  uid: string;
  contract: MigrationDestinationContract;
  driveSnap: DocumentSnapshot;
}): Promise<void> {
  const { db, fileRef, f: initialF, uid, contract, driveSnap } = params;
  let f = initialF;
  const budgetMs = migrationTransferBudgetMs();
  const maxPerPass = migrationMaxPartsPerPass();
  const passStart = Date.now();
  let uploadId = ((f.transfer_session as Record<string, unknown>)?.b2_upload_id as string) ?? "";
  const objectKey = ((f.transfer_session as Record<string, unknown>)?.b2_object_key as string) ?? "";
  const contentType =
    ((f.transfer_session as Record<string, unknown>)?.content_type as string) || "application/octet-stream";
  const tsess = f.transfer_session as Record<string, unknown> | undefined;
  const sizeExpected =
    typeof tsess?.size_bytes_expected === "number"
      ? (tsess.size_bytes_expected as number)
      : typeof f.size_bytes === "number"
        ? f.size_bytes
        : 0;
  const partSize =
    typeof (f.transfer_session as Record<string, unknown>)?.part_size_bytes === "number"
      ? ((f.transfer_session as Record<string, unknown>)?.part_size_bytes as number)
      : computeAdaptivePartPlan(sizeExpected).partSize;
  let nextByte = typeof f.next_byte === "number" ? f.next_byte : 0;
  const fileId = f.provider_file_id as string;
  const reservationId = typeof f.quota_reservation_id === "string" ? f.quota_reservation_id : null;
  const migrationFinalizeKey =
    typeof f.migration_finalize_key === "string" ? f.migration_finalize_key : "";
  const relativePath = (f.resolved_relative_path as string) ?? "";

  const access = await getGoogleAccessToken(db, uid);
  let partsThisPass = 0;

  if (!uploadId || !objectKey) {
    await failFileTransfer(fileRef, f, {
      reservationId,
      objectKey: objectKey || null,
      uploadId: uploadId || null,
      code: "missing_upload_session",
      detail: "b2_upload_id or object_key missing",
    });
    return;
  }

  while (nextByte < sizeExpected) {
    if (!planPartsRemainingForBudget({ partsAlreadyUploadedThisPass: partsThisPass, maxPerPass })) break;
    if (Date.now() - passStart > budgetMs) break;

    const remaining = sizeExpected - nextByte;
    const thisPartSize = Math.min(partSize, remaining);
    const rangeEnd = nextByte + thisPartSize - 1;
    const partNumber = Math.floor(nextByte / partSize) + 1;

    const dl = await googleDownloadFileMediaRange(access, fileId, nextByte, rangeEnd);
    if (!dl.ok) {
      await failFileTransfer(fileRef, await fileRef.get().then((s) => s.data() ?? {}), {
        reservationId,
        objectKey,
        uploadId,
        code: "google_range_download_failed",
        detail: `google_download_${dl.status}`,
      });
      return;
    }

    const { etag } = await uploadMultipartPartServerSide(
      objectKey,
      uploadId,
      partNumber,
      dl.buffer
    );

    await fileRef.collection(MIGRATION_FILES_PARTS_SUBCOLLECTION).doc(String(partNumber)).set({
      part_number: partNumber,
      etag,
      size_bytes: thisPartSize,
      byte_start: nextByte,
      byte_end: rangeEnd,
      uploaded_at: FieldValue.serverTimestamp(),
    });

    nextByte = rangeEnd + 1;
    partsThisPass++;
    const rows = await loadPartRows(fileRef);
    await fileRef.update({
      next_byte: nextByte,
      bytes_transferred: nextByte,
      parts_completed: rows.length,
      transfer_status: "in_progress",
      transfer_session: {
        ...(f.transfer_session as Record<string, unknown>),
        state: "uploading",
      },
      checkpoint_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    f = (await fileRef.get()).data() as Record<string, unknown>;
  }

  if (nextByte < sizeExpected) return;

  let rows = await loadPartRows(fileRef);
  let continuity = verifyPartContinuityAndTotals(rows, sizeExpected);
  if (!continuity.ok) {
    await reconcilePartsFromB2(objectKey, uploadId, fileRef, sizeExpected, partSize);
    rows = await loadPartRows(fileRef);
    continuity = verifyPartContinuityAndTotals(rows, sizeExpected);
  }
  if (!continuity.ok) {
    await failFileTransfer(fileRef, f, {
      reservationId,
      objectKey,
      uploadId,
      code: "part_continuity_failed",
      detail: continuity.error,
    });
    return;
  }

  const completedParts = rows
    .map((r) => ({ partNumber: r.partNumber, etag: r.etag }))
    .sort((a, b) => a.partNumber - b.partNumber);
  if (completedParts.length === 0) {
    await failFileTransfer(fileRef, f, {
      reservationId,
      objectKey,
      uploadId,
      code: "no_parts_to_complete",
      detail: "empty_part_list",
    });
    return;
  }

  await fileRef.update({
    transfer_status: "verifying",
    transfer_session: {
      ...(f.transfer_session as Record<string, unknown>),
      state: "completing",
    },
    updated_at: FieldValue.serverTimestamp(),
    checkpoint_at: FieldValue.serverTimestamp(),
  });

  const headBeforeComplete = await getObjectMetadata(objectKey);
  if (headBeforeComplete && headBeforeComplete.contentLength === sizeExpected) {
    f = (await fileRef.get()).data() as Record<string, unknown>;
    await finalizeAndCompleteFile({
      db,
      fileRef,
      f,
      uid,
      contract,
      driveSnap,
      objectKey,
      relativePath,
      sizeExpected,
      contentType,
      reservationId,
      migrationFinalizeKey,
      providerFileMeta: f,
    });
    return;
  }

  await completeMultipartUpload(
    objectKey,
    uploadId,
    completedParts.map((p) => ({ partNumber: p.partNumber, etag: p.etag }))
  );

  await finalizeAndCompleteFile({
    db,
    fileRef,
    f: (await fileRef.get()).data() as Record<string, unknown>,
    uid,
    contract,
    driveSnap,
    objectKey,
    relativePath,
    sizeExpected,
    contentType,
    reservationId,
    migrationFinalizeKey,
    providerFileMeta: f,
  });
}

async function runSinglePassStream(params: {
  db: Firestore;
  fileRef: DocumentReference;
  f: Record<string, unknown>;
  uid: string;
  contract: MigrationDestinationContract;
  provider: "google_drive" | "dropbox";
  driveSnap: DocumentSnapshot;
}): Promise<void> {
  const { db, fileRef, f, uid, contract, provider, driveSnap } = params;
  const objectKey =
    ((f.transfer_session as Record<string, unknown>)?.b2_object_key as string) ??
    (() => {
      throw new Error("missing_object_key");
    })();
  const contentType =
    ((f.transfer_session as Record<string, unknown>)?.content_type as string) || "application/octet-stream";
  const ts = f.transfer_session as Record<string, unknown> | undefined;
  const sizeBytes =
    typeof ts?.size_bytes_expected === "number"
      ? (ts.size_bytes_expected as number)
      : typeof f.size_bytes === "number"
        ? f.size_bytes
        : 0;
  const relativePath = (f.resolved_relative_path as string) ?? "";
  const reservationId = typeof f.quota_reservation_id === "string" ? f.quota_reservation_id : null;
  const migrationFinalizeKey =
    typeof f.migration_finalize_key === "string" ? f.migration_finalize_key : "";

  const headMeta = await getObjectMetadata(objectKey);
  if (
    sizeBytes > 0 &&
    headMeta?.contentLength === sizeBytes &&
    migrationFinalizeKey &&
    relativePath
  ) {
    await finalizeAndCompleteFile({
      db,
      fileRef,
      f,
      uid,
      contract,
      driveSnap,
      objectKey,
      relativePath,
      sizeExpected: sizeBytes,
      contentType,
      reservationId,
      migrationFinalizeKey,
      providerFileMeta: f,
    });
    return;
  }

  await fileRef.update({
    transfer_status: "in_progress",
    transfer_session: {
      ...(f.transfer_session as Record<string, unknown>),
      state: "uploading",
    },
    updated_at: FieldValue.serverTimestamp(),
    checkpoint_at: FieldValue.serverTimestamp(),
  });

  let body: ReadableStream<Uint8Array> | null = null;
  let contentLength: number | null = sizeBytes > 0 ? sizeBytes : null;
  if (provider === "google_drive") {
    const access = await getGoogleAccessToken(db, uid);
    const res = await googleDownloadFileMedia(access, f.provider_file_id as string);
    if (!res.ok) {
      await failFileTransfer(fileRef, f, {
        reservationId,
        objectKey,
        uploadId: null,
        code: "google_download_failed",
        detail: `google_download_${res.status}`,
      });
      return;
    }
    const cl = res.headers.get("content-length");
    contentLength = cl ? parseInt(cl, 10) : contentLength;
    body = res.body;
  } else {
    const access = await getDropboxAccessToken(db, uid);
    const res = await dropboxDownload(access, (f.dropbox_path_lower as string) ?? "");
    if (!res.ok) {
      await failFileTransfer(fileRef, f, {
        reservationId,
        objectKey,
        uploadId: null,
        code: "dropbox_download_failed",
        detail: `dropbox_download_${res.status}`,
      });
      return;
    }
    const cl = res.headers.get("content-length");
    contentLength = cl ? parseInt(cl, 10) : contentLength;
    body = res.body;
  }

  await streamWebBodyToB2Multipart({
    objectKey,
    contentType,
    contentLength: contentLength != null && Number.isFinite(contentLength) ? contentLength : null,
    body,
  });

  await finalizeAndCompleteFile({
    db,
    fileRef,
    f: (await fileRef.get()).data() as Record<string, unknown>,
    uid,
    contract,
    driveSnap,
    objectKey,
    relativePath,
    sizeExpected: sizeBytes,
    contentType,
    reservationId,
    migrationFinalizeKey,
    providerFileMeta: f,
  });
}

async function finalizeAndCompleteFile(params: {
  db: Firestore;
  fileRef: DocumentReference;
  f: Record<string, unknown>;
  uid: string;
  contract: MigrationDestinationContract;
  driveSnap: DocumentSnapshot;
  objectKey: string;
  relativePath: string;
  sizeExpected: number;
  contentType: string;
  reservationId: string | null;
  migrationFinalizeKey: string;
  providerFileMeta: Record<string, unknown>;
}): Promise<void> {
  const {
    db,
    fileRef,
    f,
    uid,
    contract,
    driveSnap,
    objectKey,
    relativePath,
    sizeExpected,
    contentType,
    reservationId,
    migrationFinalizeKey,
    providerFileMeta,
  } = params;

  const meta = await getObjectMetadata(objectKey);
  const actual = meta?.contentLength ?? -1;
  if (actual !== sizeExpected && sizeExpected > 0) {
    if (reservationId) await releaseReservation(reservationId, "size_mismatch").catch(() => {});
    await failFileTransfer(fileRef, f, {
      reservationId: null,
      objectKey,
      uploadId: null,
      code: "size_mismatch_after_upload",
      detail: `expected ${sizeExpected} got ${actual}`,
    });
    return;
  }

  let verification: "size_ok" | "checksum_ok" | "checksum_mismatch" = "size_ok";
  const md5Expected = providerFileMeta.provider_checksum_md5 as string | undefined;
  if (
    md5Expected &&
    /^[a-f0-9]{32}$/i.test(md5Expected) &&
    sizeExpected > 0 &&
    sizeExpected <= 50 * 1024 * 1024
  ) {
    const buf = await getObjectBuffer(objectKey, 50 * 1024 * 1024);
    const h = createHash("md5").update(buf).digest("hex");
    verification =
      h.toLowerCase() === md5Expected.toLowerCase() ? "checksum_ok" : "checksum_mismatch";
  }

  await fileRef.update({
    transfer_status: "finalizing",
    transfer_session: {
      ...(f.transfer_session as Record<string, unknown>),
      state: "finalizing",
    },
    updated_at: FieldValue.serverTimestamp(),
    checkpoint_at: FieldValue.serverTimestamp(),
  });

  const { backup_file_id } = await finalizeMigrationBackupFile({
    db,
    uid,
    driveId: contract.linked_drive_id,
    driveSnap,
    objectKey,
    relativePath,
    fileSize: actual >= 0 ? actual : sizeExpected,
    contentType,
    organizationId: contract.organization_id,
    workspaceId: contract.workspace_id,
    visibilityScope: contract.visibility_scope,
    reservationId,
    migrationFinalizeKey,
    appOrigin: null,
    idToken: null,
  });

  await fileRef.update({
    transfer_status: "completed",
    backup_file_id,
    backup_file_object_key: objectKey,
    transfer_verification_status: verification,
    transfer_completed_at: new Date().toISOString(),
    transfer_session: {
      ...(f.transfer_session as Record<string, unknown>),
      result: "completed",
      state: "finalizing",
    },
    transfer_claim_token: null,
    transfer_claim_expires_at: null,
    updated_at: FieldValue.serverTimestamp(),
    checkpoint_at: FieldValue.serverTimestamp(),
  });
}

async function repairIncompleteFinalization(params: {
  db: Firestore;
  fileRef: DocumentReference;
  f: Record<string, unknown>;
  uid: string;
  contract: MigrationDestinationContract;
  driveSnap: DocumentSnapshot;
}): Promise<void> {
  const { db, fileRef, f, uid, contract, driveSnap } = params;
  const objectKey =
    ((f.transfer_session as Record<string, unknown>)?.b2_object_key as string) || "";
  const relativePath = (f.resolved_relative_path as string) || "";
  const ts = f.transfer_session as Record<string, unknown> | undefined;
  const sizeExpected =
    typeof ts?.size_bytes_expected === "number"
      ? (ts.size_bytes_expected as number)
      : typeof f.size_bytes === "number"
        ? f.size_bytes
        : 0;
  const contentType =
    ((f.transfer_session as Record<string, unknown>)?.content_type as string) ||
    "application/octet-stream";
  const reservationId = typeof f.quota_reservation_id === "string" ? f.quota_reservation_id : null;
  const migrationFinalizeKey =
    typeof f.migration_finalize_key === "string" ? f.migration_finalize_key : "";
  if (!objectKey || !migrationFinalizeKey) return;

  const meta = await getObjectMetadata(objectKey);
  if (!meta || meta.contentLength !== sizeExpected) return;

  await finalizeAndCompleteFile({
    db,
    fileRef,
    f,
    uid,
    contract,
    driveSnap,
    objectKey,
    relativePath,
    sizeExpected,
    contentType,
    reservationId,
    migrationFinalizeKey,
    providerFileMeta: f,
  });
}

/** Pick next file doc for transfer with fairness (in-memory over a finite query). */
export function selectNextMigrationFileCandidate(params: {
  docs: QueryDocumentSnapshot[];
  fairnessLastFileId: string | null;
  fairnessConsecutive: number;
  maxConsecutive: number;
}): QueryDocumentSnapshot | null {
  const supported = params.docs.filter((d) => String(d.data().unsupported_reason ?? "") === "supported");
  if (supported.length === 0) return null;

  const resumableStatuses: MigrationFileTransferStatus[] = [
    "session_initializing",
    "in_progress",
    "needs_repair",
    "verifying",
    "finalizing",
  ];
  const resumable = supported.filter((d) =>
    resumableStatuses.includes(d.data().transfer_status as MigrationFileTransferStatus)
  );
  const pending = supported.filter((d) => String(d.data().transfer_status) === "pending");

  const sortByCheckpoint = (a: QueryDocumentSnapshot, b: QueryDocumentSnapshot) => {
    const ta = (a.data().checkpoint_at as Timestamp | undefined)?.toMillis() ?? 0;
    const tb = (b.data().checkpoint_at as Timestamp | undefined)?.toMillis() ?? 0;
    return ta - tb;
  };
  const sortByCreated = (a: QueryDocumentSnapshot, b: QueryDocumentSnapshot) => {
    const ta = (a.data().created_at as Timestamp | undefined)?.toMillis() ?? 0;
    const tb = (b.data().created_at as Timestamp | undefined)?.toMillis() ?? 0;
    return ta - tb;
  };

  resumable.sort(sortByCheckpoint);
  pending.sort(sortByCreated);

  const starve =
    params.fairnessLastFileId &&
    params.fairnessConsecutive >= params.maxConsecutive &&
    pending.length > 0;

  if (starve) {
    const p0 = pending[0]!;
    if (resumable.length === 0 || resumable[0]!.id !== params.fairnessLastFileId) return p0;
    const alternate = pending.find((d) => d.id !== params.fairnessLastFileId);
    return alternate ?? p0;
  }

  if (resumable.length > 0) return resumable[0]!;
  if (pending.length > 0) return pending[0]!;
  return null;
}
