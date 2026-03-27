/**
 * POST /api/packages/[packageId]/download-zip
 * One-click full macOS package restore: streams a ZIP with paths matching relative_path (e.g. MyLib.fcpbundle/...).
 */
import { PassThrough, Readable } from "stream";
import archiver from "archiver";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getObject, isB2Configured } from "@/lib/b2";
import { verifyMacosPackageAccessForUser } from "@/lib/macos-package-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { NextResponse } from "next/server";

const PAGE = 500;

/** Allow up to 5 min for large Final Cut libraries. */
export const maxDuration = 300;

function uniqueZipNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((raw) => {
    const base = raw.replace(/\.([^.]+)$/, "");
    const ext = raw.includes(".") ? raw.slice(raw.lastIndexOf(".")) : "";
    let name = raw;
    let n = 0;
    while (used.has(name)) {
      n++;
      name = `${base} (${n})${ext}`;
    }
    used.set(name, 1);
    return name;
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json({ error: "Backblaze B2 is not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { packageId } = await params;
  if (!packageId || !packageId.startsWith("pkg_")) {
    return NextResponse.json({ error: "Invalid package id" }, { status: 400 });
  }

  const access = await verifyMacosPackageAccessForUser(uid, packageId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const firstKey = await fetchFirstMemberObjectKey(packageId);
  if (!firstKey) {
    return NextResponse.json({ error: "Package has no files" }, { status: 404 });
  }
  const life = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, firstKey);
  if (!life.allowed) {
    return NextResponse.json({ error: life.message ?? "Access denied" }, { status: life.status ?? 403 });
  }

  const rootName =
    (access.data.root_segment_name as string) ||
    String(access.data.root_relative_path ?? "").split("/").pop() ||
    "package";
  const safeZipName = rootName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120) || "package";

  const archive = archiver("zip", { zlib: { level: 0 } });
  archive.on("error", (err) => {
    console.error("[package download-zip] Archive error:", err);
  });
  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  const db = getAdminFirestore();

  (async () => {
    try {
      let last: QueryDocumentSnapshot | undefined;
      const pending: { object_key: string; name: string }[] = [];

      for (;;) {
        let q = db
          .collection("backup_files")
          .where("macos_package_id", "==", packageId)
          .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
          .orderBy("relative_path")
          .limit(PAGE);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
          const d = doc.data();
          const objectKey = d.object_key as string | undefined;
          const rel = (d.relative_path as string) ?? "";
          if (!objectKey || !rel) continue;
          pending.push({ object_key: objectKey, name: rel.replace(/^\/+/, "") });
        }
        last = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < PAGE) break;
      }

      const names = uniqueZipNames(pending.map((p) => p.name));
      for (let i = 0; i < pending.length; i++) {
        const { object_key } = pending[i];
        const name = names[i] ?? pending[i].name;
        const { body } = await getObject(object_key);
        const nodeStream =
          typeof (body as { getReader?: unknown }).getReader === "function"
            ? Readable.fromWeb(body as unknown as Parameters<typeof Readable.fromWeb>[0])
            : (body as NodeJS.ReadableStream);
        archive.append(nodeStream as import("stream").Readable, { name });
      }
      await archive.finalize();
    } catch (err) {
      console.error("[package download-zip] Error:", err);
      archive.emit("error", err);
    }
  })();

  const webStream = Readable.toWeb(passThrough) as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeZipName}-restore.zip"`,
    },
  });
}

async function fetchFirstMemberObjectKey(packageId: string): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("backup_files")
    .where("macos_package_id", "==", packageId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return (snap.docs[0].data().object_key as string) ?? null;
}
