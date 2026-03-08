/** Upload session and multipart types for resumable direct-to-B2 uploads. */

export type UploadSessionStatus =
  | "pending"
  | "uploading"
  | "completed"
  | "aborted"
  | "failed";

export interface UploadSession {
  id: string;
  userId: string;
  workspaceId?: string;
  driveId: string;
  objectKey: string;
  uploadId: string;
  status: UploadSessionStatus;
  fileFingerprint: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  contentType: string;
  partSize: number;
  totalParts: number;
  completedPartNumbers: number[];
  partEtags: Record<number, string>;
  bytesTransferred: number;
  retryCount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadCreateResponse {
  sessionId: string | null;
  objectKey: string;
  uploadId: string | null;
  recommendedPartSize: number;
  recommendedConcurrency: number;
  totalParts: number;
  parts: { partNumber: number; uploadUrl: string }[];
  alreadyExists?: boolean;
  existingObjectKey?: string;
}

export interface UploadSignPartsResponse {
  parts: { partNumber: number; uploadUrl: string }[];
}

export interface FileFingerprint {
  size: number;
  name: string;
  lastModified: number;
  sampledHash: string;
}
