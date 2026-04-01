/**
 * Canonical B2 object key layout for backup uploads.
 * All upload surfaces (Uppy multipart, legacy upload-url, migration worker) must use this helper
 * so paths never drift. Ownership/billing truth lives in Firestore (`linked_drive_id`, scope fields
 * on `backup_files`); the `pathSubjectUid` segment matches existing platform convention (`backups/{uid}/...`).
 */
export function sanitizeBackupRelativePath(relativePath: string): string {
  return relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
}

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export interface BuildBackupObjectKeyInput {
  /** Firebase uid used in the key prefix (the authenticated uploader in standard uploads). */
  pathSubjectUid: string;
  driveId: string;
  relativePath: string;
  /** When set to a 64-char hex SHA-256, object is content-addressed under `content/`. */
  contentHash?: string | null;
}

export function buildBackupObjectKey(input: BuildBackupObjectKeyInput): string {
  const { pathSubjectUid, driveId, relativePath, contentHash } = input;
  const safePath = sanitizeBackupRelativePath(relativePath);
  if (contentHash && typeof contentHash === "string" && SHA256_HEX.test(contentHash)) {
    return `content/${contentHash.toLowerCase()}`;
  }
  return `backups/${pathSubjectUid}/${driveId}/${safePath}`;
}
