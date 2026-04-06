/**
 * Asset Delivery Resolution — shared proxy-presence and Firestore hint logic.
 * When DELIVERY_USE_FIRESTORE_PROXY_HINTS is false, behavior matches legacy HeadObject checks.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { getProxyObjectKey, objectExists } from "@/lib/b2";
import { MIN_PROXY_SIZE_BYTES } from "@/lib/format-detection";
import {
  deliveryHeadFallbackEnabled,
  deliveryUseFirestoreProxyHints,
} from "@/lib/delivery-flags";

export function getCanonicalProxyKey(sourceObjectKey: string): string {
  return getProxyObjectKey(sourceObjectKey);
}

/** True when backup_files projection says proxy is ready and size is plausible. */
export function backupFileProxyReadyInDoc(
  data: Record<string, unknown> | undefined,
  sourceObjectKey: string
): boolean {
  if (!data) return false;
  const ps = data.proxy_status as string | undefined;
  if (ps !== "ready") return false;
  const sz = data.proxy_size_bytes;
  if (typeof sz === "number" && Number.isFinite(sz) && sz < MIN_PROXY_SIZE_BYTES) return false;
  const pok = data.proxy_object_key as string | undefined;
  const expected = getProxyObjectKey(sourceObjectKey);
  if (typeof pok === "string" && pok.length > 0 && pok !== expected) return false;
  return true;
}

/** Same doc selection as video-stream-url (first match up to 5). */
export async function fetchBackupFileDataForObjectKey(
  objectKey: string
): Promise<Record<string, unknown> | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("backup_files")
    .where("object_key", "==", objectKey)
    .limit(5)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.data() as Record<string, unknown>;
}

/** Prefer `backup_files` doc id from transfer payload when present (avoids ambiguous object_key matches). */
export async function fetchBackupFileDataForTransferEntry(
  objectKey: string,
  backupFileId: string | undefined
): Promise<Record<string, unknown> | null> {
  const db = getAdminFirestore();
  if (backupFileId) {
    const d = await db.collection("backup_files").doc(backupFileId).get();
    return d.exists ? (d.data() as Record<string, unknown>) : null;
  }
  return fetchBackupFileDataForObjectKey(objectKey);
}

/**
 * Whether the transcoded proxy object exists for this source key.
 * - Legacy (hints off): always HeadObject on proxy key.
 * - Hints on: skip HeadObject when Firestore says ready; otherwise HeadObject (preserves proxy-before-DB-update races).
 */
export async function resolveProxyExistsForBackup(
  sourceObjectKey: string,
  backupFileData: Record<string, unknown> | null | undefined
): Promise<{ exists: boolean; usedHead: boolean }> {
  const proxyKey = getProxyObjectKey(sourceObjectKey);
  const useHints = deliveryUseFirestoreProxyHints();

  if (useHints && backupFileData && backupFileProxyReadyInDoc(backupFileData, sourceObjectKey)) {
    if (deliveryHeadFallbackEnabled()) {
      const headOk = await objectExists(proxyKey);
      return { exists: headOk, usedHead: true };
    }
    return { exists: true, usedHead: false };
  }

  const exists = await objectExists(proxyKey);
  return { exists, usedHead: true };
}

/** preview-url style: effective key is proxy if exists else source. */
export async function resolvePreviewInlineEffectiveKey(
  sourceObjectKey: string,
  backupFileData: Record<string, unknown> | null | undefined
): Promise<{ effectiveKey: string; usedHead: boolean }> {
  const { exists, usedHead } = await resolveProxyExistsForBackup(
    sourceObjectKey,
    backupFileData
  );
  const proxyKey = getProxyObjectKey(sourceObjectKey);
  return {
    effectiveKey: exists ? proxyKey : sourceObjectKey,
    usedHead,
  };
}
