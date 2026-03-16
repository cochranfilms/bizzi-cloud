/**
 * Bizzi Asset - V3 Smart Rendition Switching
 *
 * A Bizzi asset is ONE logical media object with multiple renditions (proxy, original).
 * The mount layer resolves the same logical path to different underlying bytes based on
 * preferredRendition (edit mode = proxy, conform mode = original).
 *
 * This is NOT a relink workflow (V1). The path stays constant; only the bytes change.
 */

export type RenditionType = "proxy" | "original";

export type RenditionReadiness = "ready" | "processing" | "missing" | "invalid" | "failed";

export type ConformValidationStatus = "ready" | "invalid" | "missing_original" | "pending";

export interface BizziRendition {
  renditionId: string;
  renditionType: RenditionType;
  storageKey: string;
  storageProvider: "b2";
  codec: string | null;
  container: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  durationMs: number | null;
  audioChannelLayout: string | null;
  audioChannels: number | null;
  fileSize: number;
  sourceHash: string | null;
  sourceTimecodeStart: string | null;
  readinessStatus: RenditionReadiness;
  /** From backup_files or proxy generation */
  backupFileId?: string | null;
  /** For proxy: the proxy_jobs id if we track it */
  proxyJobId?: string | null;
}

export interface BizziAsset {
  bizziAssetId: string;
  /** Maps to linked_drive_id for now; future: explicit projectId */
  projectId: string;
  userId: string;
  displayName: string;
  /** Stable logical path within mounted drive, e.g. "Media/A001_C003.mov" */
  logicalMountPath: string;
  /** What we SHOULD serve: proxy during edit, original during conform */
  preferredRendition: RenditionType;
  /** What we ARE serving (can lag during switch) */
  activeRendition: RenditionType;
  renditions: BizziRendition[];
  /** For validation before conform */
  validationStatus: ConformValidationStatus;
  validationReason: string | null;
  /** Original backup_files id - source of truth for original */
  originalBackupFileId: string;
  /** Proxy object key in B2 (proxies/{hash}.mp4) */
  proxyObjectKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Firestore document shape for bizzi_assets collection */
export interface BizziAssetDoc extends Omit<BizziAsset, "projectId"> {
  linked_drive_id: string;
}
