import {
  dropboxMigrationAppKey,
  dropboxMigrationAppSecret,
} from "@/lib/migration-oauth-env";
import type { MigrationUnsupportedReason } from "@/lib/migration-constants";
import { migrationMaxFileBytes } from "@/lib/migration-constants";

export async function dropboxRefreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const key = dropboxMigrationAppKey();
  const secret = dropboxMigrationAppSecret();
  if (!key || !secret) {
    throw new Error("Dropbox OAuth is not configured");
  }
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg =
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json.error === "string"
          ? json.error
          : "Dropbox token refresh failed";
    throw new Error(errMsg);
  }
  const access = json.access_token as string;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 14_400;
  if (!access) throw new Error("No access_token");
  return { access_token: access, expires_in: expiresIn };
}

export interface DropboxListEntry {
  ".tag": string;
  id?: string;
  name: string;
  path_lower: string;
  path_display?: string;
  size?: number;
}

export interface DropboxListFolderResult {
  entries: DropboxListEntry[];
  cursor?: string;
  has_more: boolean;
}

export async function dropboxListFolder(
  accessToken: string,
  path: string,
  cursor?: string
): Promise<DropboxListFolderResult> {
  const useContinue = Boolean(cursor && cursor.length > 0);
  const url = useContinue
    ? "https://api.dropboxapi.com/2/files/list_folder/continue"
    : "https://api.dropboxapi.com/2/files/list_folder";
  const arg = useContinue ? { cursor } : { path: path === "" ? "" : path, recursive: false, include_deleted: false };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(arg),
  });
  const json = (await res.json()) as DropboxListFolderResult & {
    error_summary?: string;
  };
  if (!res.ok) {
    throw new Error(json.error_summary ?? "Dropbox list_folder failed");
  }
  return {
    entries: json.entries ?? [],
    cursor: json.cursor,
    has_more: json.has_more === true,
  };
}

export async function dropboxDownload(
  accessToken: string,
  pathLower: string
): Promise<Response> {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: pathLower }),
    },
  });
  return res;
}

export function classifyDropboxItem(meta: DropboxListEntry): {
  supported: boolean;
  reason: MigrationUnsupportedReason;
} {
  if (meta[".tag"] === "folder") {
    return { supported: true, reason: "supported" };
  }
  if (meta[".tag"] !== "file") {
    return { supported: false, reason: "unknown_provider_object" };
  }
  const sz = typeof meta.size === "number" ? meta.size : 0;
  if (sz > migrationMaxFileBytes()) {
    return { supported: false, reason: "file_too_large_for_phase1" };
  }
  const lower = meta.name.toLowerCase();
  if (lower.endsWith(".paper")) {
    return { supported: false, reason: "unsupported_provider_native" };
  }
  return { supported: true, reason: "supported" };
}
