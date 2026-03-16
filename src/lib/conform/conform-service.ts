/**
 * Bizzi Conform Service - V3 Smart Rendition Switching
 *
 * Conform = flip preferredRendition from proxy to original for a project/scope.
 * The mount layer then serves original bytes behind the SAME logical path.
 * No relink. No path change. The NLE keeps reading the same file path.
 *
 * This is V3: rendition resolver workflow, not V1 relink workflow.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getObjectMetadata, getProxyObjectKey } from "@/lib/b2";
import { MIN_PROXY_SIZE_BYTES } from "@/lib/format-detection";
import type { ConformReport, ConformReportEntry, ConformSession } from "@/types/conform";
import { getProjectRenditionState, setProjectRenditionStates } from "./project-rendition-state";
import { validateAssetForConform } from "./validation";

const CONFORM_SESSIONS = "conform_sessions";

/** Returns all drive IDs that share the same slug as projectId (e.g. all Storage drives). */
async function getDriveIdsForSlug(
  db: Firestore,
  userId: string,
  projectId: string
): Promise<string[]> {
  const driveSnap = await db.collection("linked_drives").doc(projectId).get();
  const data = driveSnap.exists ? driveSnap.data() : {};
  const projectName = (data?.name ?? "Drive") as string;
  const isCreatorRaw = data?.is_creator_raw === true;
  const slug =
    projectName === "Storage" || projectName === "Uploads"
      ? "Storage"
      : isCreatorRaw
        ? "RAW"
        : projectName === "Gallery Media"
          ? "Gallery Media"
          : projectName;

  const [byUserId, byUserIdSnake] = await Promise.all([
    db.collection("linked_drives").where("userId", "==", userId).get(),
    db.collection("linked_drives").where("user_id", "==", userId).get(),
  ]);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const snap of [byUserId, byUserIdSnake]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data();
      if (data.deleted_at) continue;
      const name = data.name ?? "Drive";
      const isCreatorRaw = data.is_creator_raw === true;
      const matches =
        slug === "Storage"
          ? name === "Storage" || name === "Uploads"
          : slug === "RAW"
            ? isCreatorRaw
            : slug === "Gallery Media"
              ? name === "Gallery Media"
              : name === slug;
      if (matches) ids.push(d.id);
    }
  }
  return ids.length > 0 ? ids : [projectId];
}

export interface ConformScope {
  projectId: string; // linked_drive_id
  folderPath?: string | null;
  assetIds?: string[] | null;
}

export interface ConformOptions {
  pinOriginals?: boolean;
  keepProxiesCached?: boolean;
}

export interface ConformResult {
  sessionId: string;
  status: ConformSession["status"];
  totalAssets: number;
  switchedAssets: number;
  failedAssets: number;
  skippedAssets: number;
  requestedModeApplied: boolean;
  activeMode: "proxy" | "original";
  report: ConformReport;
}

const VIDEO_EXT =
  /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp|m2ts|mpg|mpeg|ts|flv|wmv|ogv|braw|r3d|ari|dng)$/i;

function isVideo(path: string): boolean {
  return VIDEO_EXT.test(path);
}

/**
 * Start a conform session: validate assets, prewarm, switch preferredRendition to original.
 */
export async function startConformSession(
  userId: string,
  scope: ConformScope,
  options: ConformOptions = {}
): Promise<ConformResult> {
  const db = getAdminFirestore();
  const now = new Date().toISOString();

  const sessionRef = await db.collection(CONFORM_SESSIONS).add({
    projectId: scope.projectId,
    userId,
    targetScope: scope.folderPath ? "folder" : scope.assetIds?.length ? "assets" : "project",
    folderPath: scope.folderPath ?? null,
    assetIds: scope.assetIds ?? null,
    requestedMode: "original",
    startedAt: now,
    completedAt: null,
    status: "validating",
    totalAssets: 0,
    switchedAssets: 0,
    failedAssets: 0,
    skippedAssets: 0,
    reportJson: null,
    pinOriginals: options.pinOriginals ?? false,
    keepProxiesCached: options.keepProxiesCached ?? false,
  });

  const sessionId = sessionRef.id;

  try {
    // 1. Fetch backup_files in scope
    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", userId)
      .where("linked_drive_id", "==", scope.projectId)
      .where("deleted_at", "==", null)
      .get();

    let docs = filesSnap.docs;
    if (scope.folderPath) {
      const prefix = scope.folderPath.endsWith("/")
        ? scope.folderPath
        : scope.folderPath + "/";
      docs = docs.filter((d) => {
        const p = (d.data().relative_path as string) ?? "";
        return p === scope.folderPath || p.startsWith(prefix);
      });
    }
    if (scope.assetIds?.length) {
      const idSet = new Set(scope.assetIds);
      docs = docs.filter((d) => idSet.has(d.id));
    }

    const videoFiles = docs.filter((d) =>
      isVideo((d.data().relative_path as string) ?? "")
    );

    const reportEntries: ConformReportEntry[] = [];
    const readyEntries: ConformReportEntry[] = [];
    let switched = 0;
    let failed = 0;
    let skipped = 0;

    for (const doc of videoFiles) {
      const data = doc.data();
      const objectKey = data.object_key as string;
      const relativePath = (data.relative_path as string) ?? "";
      const proxyObjectKey = (data.proxy_object_key as string) ?? getProxyObjectKey(objectKey);
      const proxyMeta = await getObjectMetadata(proxyObjectKey).catch(() => null);
      const hasProxy =
        proxyMeta && proxyMeta.contentLength >= MIN_PROXY_SIZE_BYTES;

      if (!hasProxy) {
        reportEntries.push({
          bizziAssetId: doc.id,
          displayName: relativePath.split("/").pop() ?? relativePath,
          logicalMountPath: relativePath,
          status: "skipped",
          reason: "No proxy",
          proxyObjectKey: null,
          originalObjectKey: objectKey,
        });
        skipped++;
        continue;
      }

      const validation = await validateAssetForConform({
        backupFileId: doc.id,
        objectKey,
        relativePath,
        proxyObjectKey,
        proxyStatus: data.proxy_status,
        durationSec: data.duration_sec,
        frameRate: data.frame_rate,
        audioChannels: data.audio_channels,
        proxyDurationSec: data.proxy_duration_sec ?? undefined,
        proxySizeBytes: data.proxy_size_bytes ?? proxyMeta?.contentLength,
      });

      if (validation.status !== "ready") {
        reportEntries.push({
          bizziAssetId: doc.id,
          displayName: relativePath.split("/").pop() ?? relativePath,
          logicalMountPath: relativePath,
          status: "failed",
          reason: validation.reason ?? "Validation failed",
          proxyObjectKey,
          originalObjectKey: objectKey,
        });
        failed++;
        continue;
      }

      readyEntries.push({
        bizziAssetId: doc.id,
        displayName: relativePath.split("/").pop() ?? relativePath,
        logicalMountPath: relativePath,
        status: "switched",
        reason: null,
        proxyObjectKey,
        originalObjectKey: objectKey,
      });
      switched++;
    }

    // 2. Update project rendition state to original only when validation succeeded for every
    // proxy-backed clip. This avoids a project-level mode flip that would silently switch
    // failed clips too, since the mount layer stores rendition state per drive/project.
    // When user selects "Storage" (or RAW/Gallery Media), set state for ALL drives with that slug
    // so the mount (which merges files from all such drives) serves originals for every file.
    const driveIdsToSet = await getDriveIdsForSlug(db, userId, scope.projectId);
    let requestedModeApplied = false;

    if (failed === 0 && readyEntries.length > 0) {
      await setProjectRenditionStates(userId, driveIdsToSet, "original", sessionId);
      requestedModeApplied = true;
      reportEntries.push(...readyEntries);
    } else if (failed > 0) {
      switched = 0;
      for (const entry of readyEntries) {
        reportEntries.push({
          ...entry,
          status: "skipped",
          reason: "Conform did not switch the mounted drive because one or more clips failed validation.",
        });
        skipped++;
      }
    } else {
      reportEntries.push(...readyEntries);
    }

    const activeModeMap = await getProjectRenditionState(userId, driveIdsToSet);
    const activeMode = driveIdsToSet.some((did) => activeModeMap.get(did) === "original")
      ? "original"
      : "proxy";

    const report: ConformReport = {
      sessionId,
      entries: reportEntries,
      summary: {
        total: videoFiles.length,
        switched,
        failed,
        skipped,
      },
    };

    const status: ConformSession["status"] =
      requestedModeApplied
        ? skipped > 0
          ? "partial"
          : "completed"
        : failed > 0
          ? "failed"
          : skipped > 0
            ? "partial"
            : "completed";

    await sessionRef.update({
      status,
      completedAt: new Date().toISOString(),
      totalAssets: videoFiles.length,
      switchedAssets: switched,
      failedAssets: failed,
      skippedAssets: skipped,
      requestedModeApplied,
      activeMode,
      reportJson: JSON.stringify(report),
    });

    return {
      sessionId,
      status,
      totalAssets: videoFiles.length,
      switchedAssets: switched,
      failedAssets: failed,
      skippedAssets: skipped,
      requestedModeApplied,
      activeMode,
      report,
    };
  } catch (err) {
    await sessionRef.update({
      status: "failed",
      completedAt: new Date().toISOString(),
      reportJson: JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    });
    throw err;
  }
}

/**
 * Revert to proxies: flip preferredRendition back to proxy.
 * Sets state for all drives in the same slug (Storage/RAW/Gallery Media).
 */
export async function revertToProxies(
  userId: string,
  projectId: string
): Promise<void> {
  const db = getAdminFirestore();
  const driveIdsToSet = await getDriveIdsForSlug(db, userId, projectId);
  await setProjectRenditionStates(userId, driveIdsToSet, "proxy", null);

  await db.collection(CONFORM_SESSIONS).add({
    projectId,
    userId,
    targetScope: "project",
    folderPath: null,
    assetIds: null,
    requestedMode: "proxy",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: "completed",
    totalAssets: 0,
    switchedAssets: 0,
    failedAssets: 0,
    skippedAssets: 0,
    reportJson: null,
  });
}

/**
 * Get conform report for a session.
 */
export async function getConformReport(
  userId: string,
  sessionId: string
): Promise<ConformReport | null> {
  const db = getAdminFirestore();
  const doc = await db.collection(CONFORM_SESSIONS).doc(sessionId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data?.userId !== userId) return null;
  const json = data?.reportJson;
  if (!json) return null;
  return JSON.parse(json) as ConformReport;
}
