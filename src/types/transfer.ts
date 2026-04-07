export interface TransferFile {
  id: string;
  name: string;
  type: "file";
  size?: number;
  path: string;
  views: number;
  downloads: number;
  /** Firestore backup_files doc id - for thumbnail/download lookup */
  backupFileId?: string;
  objectKey?: string;
}

/** "view" = can view/preview but not download; "downloadable" = can download. */
export type TransferPermission = "view" | "downloadable";

export interface Transfer {
  id: string;
  name: string;
  clientName: string;
  clientEmail?: string;
  files: TransferFile[];
  /** Default "downloadable" - allows recipients to download. "view" = preview only, no download. */
  permission: TransferPermission;
  /** True if transfer has a password. Password is never returned from API. */
  hasPassword?: boolean;
  /** @deprecated Use hasPassword. Kept for backward compat with local state. */
  password?: string | null;
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "cancelled";
  slug: string;
  /** Organization ID when transfer belongs to an enterprise org. Null for personal. */
  organizationId?: string | null;
  /** Personal-team container when transfer was created in a team workspace. */
  personalTeamOwnerId?: string | null;
  /** Server transfer_lifecycle when present (e.g. draft before finalize). */
  transferLifecycle?: string | null;
}

export interface CreateTransferInput {
  name: string;
  clientName: string;
  /** Set when creating from /team/{ownerId}/… workspace. */
  personalTeamOwnerId?: string | null;
  clientEmail?: string;
  files: Omit<TransferFile, "views" | "downloads" | "id">[];
  /** Default "downloadable" - allows download. "view" = preview only. */
  permission?: TransferPermission;
  password?: string | null;
  expiresAt: string | null;
}
