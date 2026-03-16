/**
 * Bizzi Conform Service - V3 Smart Rendition Switching
 *
 * Conform = flip preferredRendition from proxy to original for a project/scope.
 * The mount layer then serves original bytes behind the SAME logical path.
 * No relink. No path change. The NLE keeps reading the same file path.
 *
 * This is V3: rendition resolver workflow, not V1 relink workflow.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { getObjectMetadata, getProxyObjectKey } from "@/lib/b2";
import { MIN_PROXY_SIZE_BYTES } from "@/lib/format-detection";
import type { ConformReport, ConformReportEntry, ConformSession } from "@/types/conform";
import { getProjectRenditionState, setProjectRenditionState } from "./project-rendition-state";
import { validateAssetForConform } from "./validation";

const CONFORM_SESSIONS = "conform_sessions";

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

      reportEntries.push({
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

    // 2. Update project rendition state to original
    await setProjectRenditionState(
      userId,
      scope.projectId,
      "original",
      sessionId
    );

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
      failed > 0 || skipped > 0
        ? switched > 0
          ? "partial"
          : "failed"
        : "completed";

    await sessionRef.update({
      status,
      completedAt: new Date().toISOString(),
      totalAssets: videoFiles.length,
      switchedAssets: switched,
      failedAssets: failed,
      skippedAssets: skipped,
      reportJson: JSON.stringify(report),
    });

    return {
      sessionId,
      status,
      totalAssets: videoFiles.length,
      switchedAssets: switched,
      failedAssets: failed,
      skippedAssets: skipped,
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
 */
export async function revertToProxies(
  userId: string,
  projectId: string
): Promise<void> {
  await setProjectRenditionState(userId, projectId, "proxy", null);

  const db = getAdminFirestore();
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
