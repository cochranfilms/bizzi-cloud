import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import { getGoogleAccessToken, getDropboxAccessToken } from "@/lib/migration-provider-account";
import { googleListChildren } from "@/lib/migration-google-drive-api";
import { dropboxListFolder } from "@/lib/migration-dropbox-api";
import { checkRateLimit } from "@/lib/rate-limit";
import type { MigrationProvider } from "@/lib/migration-constants";

export async function POST(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`migration_browse:${auth.uid}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", code: "rate_limited" }, { status: 429 });
  }

  let body: {
    provider?: MigrationProvider;
    google_folder_id?: string;
    dropbox_path?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = body.provider;
  const db = getAdminFirestore();

  if (provider === "google_drive") {
    const raw = body.google_folder_id?.trim() || "";
    if (!raw || raw === "root") {
      return NextResponse.json(
        {
          error:
            "Choose a folder with Google Picker first, or open a folder you already selected. Full My Drive listing requires broader access we do not request.",
          code: "google_root_not_allowed",
        },
        { status: 400 }
      );
    }
    const folderId = raw;
    const token = await getGoogleAccessToken(db, auth.uid);
    const { files } = await googleListChildren(token, folderId);
    const entries = files.map((f) => ({
      id: f.id,
      name: f.name,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      thumbnailLink: f.thumbnailLink,
      iconLink: f.iconLink,
      imageMediaMetadata:
        f.imageMediaMetadata &&
        (f.imageMediaMetadata.width != null ||
          f.imageMediaMetadata.height != null ||
          f.imageMediaMetadata.time)
          ? {
              width: f.imageMediaMetadata.width,
              height: f.imageMediaMetadata.height,
              time: f.imageMediaMetadata.time,
            }
          : undefined,
    }));
    return NextResponse.json({ entries });
  }

  if (provider === "dropbox") {
    const path = body.dropbox_path != null ? String(body.dropbox_path) : "";
    const token = await getDropboxAccessToken(db, auth.uid);
    const list = await dropboxListFolder(token, path);
    const entries = list.entries.map((e) => ({
      id: e.path_lower,
      name: e.name,
      isFolder: e[".tag"] === "folder",
      path_lower: e.path_lower,
    }));
    return NextResponse.json({ entries, has_more: list.has_more, cursor: list.cursor ?? null });
  }

  return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
}
