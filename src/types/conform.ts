/**
 * Bizzi Conform - V3 Session & State
 *
 * Conform changes preferredRendition from proxy to original for assets.
 * The mount layer then serves original bytes behind the same logical path.
 * No relink. No path change. Just bytes.
 */

export type ConformTargetScope = "project" | "folder" | "assets";

export type ConformRequestedMode = "original" | "proxy";

export type ConformSessionStatus = "pending" | "validating" | "warming" | "switching" | "completed" | "failed" | "partial";

export interface ConformSession {
  conformSessionId: string;
  projectId: string;
  userId: string;
  targetScope: ConformTargetScope;
  /** Optional folder path when scope is folder */
  folderPath: string | null;
  /** Optional asset IDs when scope is assets */
  assetIds: string[] | null;
  requestedMode: ConformRequestedMode;
  startedAt: string;
  completedAt: string | null;
  status: ConformSessionStatus;
  totalAssets: number;
  switchedAssets: number;
  failedAssets: number;
  skippedAssets: number;
  requestedModeApplied?: boolean;
  activeMode?: ConformRequestedMode;
  reportJson: string | null;
  /** Options used */
  pinOriginals: boolean;
  keepProxiesCached: boolean;
}

export interface ConformReportEntry {
  bizziAssetId: string;
  displayName: string;
  logicalMountPath: string;
  status: "switched" | "failed" | "skipped";
  reason: string | null;
  proxyObjectKey: string | null;
  originalObjectKey: string | null;
}

export interface ConformReport {
  sessionId: string;
  entries: ConformReportEntry[];
  summary: {
    total: number;
    switched: number;
    failed: number;
    skipped: number;
  };
}

/** Project-level rendition state - which mode is active for this drive/project */
export interface ProjectRenditionState {
  projectId: string;
  userId: string;
  preferredRendition: "proxy" | "original";
  /** Last conform session that set this */
  lastConformSessionId: string | null;
  updatedAt: string;
}
