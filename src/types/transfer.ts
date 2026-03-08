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
  password?: string | null;
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "cancelled";
  slug: string;
}

export interface CreateTransferInput {
  name: string;
  clientName: string;
  clientEmail?: string;
  files: Omit<TransferFile, "views" | "downloads" | "id">[];
  /** Default "downloadable" - allows download. "view" = preview only. */
  permission?: TransferPermission;
  password?: string | null;
  expiresAt: string | null;
}
