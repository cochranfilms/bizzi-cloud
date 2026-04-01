import {
  googleMigrationClientId,
  googleMigrationClientSecret,
} from "@/lib/migration-oauth-env";
import type { MigrationUnsupportedReason } from "@/lib/migration-constants";
import { migrationMaxFileBytes } from "@/lib/migration-constants";

export interface GoogleDriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
  capabilities?: { canDownload?: boolean };
}

export interface GoogleListResponse {
  nextPageToken?: string;
  files: GoogleDriveFileMeta[];
}

export async function googleRefreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = googleMigrationClientId();
  const clientSecret = googleMigrationClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error_description === "string" ? json.error_description : "Token refresh failed");
  }
  const access = json.access_token as string;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  if (!access) throw new Error("No access_token");
  return { access_token: access, expires_in: expiresIn };
}

export async function googleListChildren(
  accessToken: string,
  folderId: string,
  pageToken?: string
): Promise<GoogleListResponse> {
  const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields:
      "nextPageToken, files(id, name, mimeType, size, md5Checksum, shortcutDetails, capabilities/canDownload)",
    pageSize: "100",
  });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as GoogleListResponse & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "Drive list failed");
  }
  return { nextPageToken: json.nextPageToken, files: json.files ?? [] };
}

export function classifyGoogleDriveItem(meta: GoogleDriveFileMeta): {
  supported: boolean;
  reason: MigrationUnsupportedReason;
} {
  if (meta.mimeType === "application/vnd.google-apps.shortcut") {
    return { supported: false, reason: "unsupported_shortcut" };
  }
  if (meta.mimeType.startsWith("application/vnd.google-apps.")) {
    return { supported: false, reason: "unsupported_provider_native" };
  }
  if (meta.capabilities?.canDownload === false) {
    return { supported: false, reason: "permission_denied_source" };
  }
  const sizeNum = meta.size != null ? parseInt(meta.size, 10) : NaN;
  if (Number.isFinite(sizeNum) && sizeNum > migrationMaxFileBytes()) {
    return { supported: false, reason: "file_too_large_for_phase1" };
  }
  return { supported: true, reason: "supported" };
}

/** Readable stream of file bytes (not Node stream — Web API Response.body). */
export async function googleDownloadFileMedia(
  accessToken: string,
  fileId: string
): Promise<Response> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res;
}
