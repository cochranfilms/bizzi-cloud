/**
 * Cron: Run orphan cleanup to remove B2 objects not referenced by backup_files.
 * Catches content/, proxies/, thumbnails/ left behind when permanent-delete B2 calls failed.
 *
 * Schedule: weekly (e.g. Sunday 5am). Requires CRON_SECRET.
 * Runs with dry_run: false to actually delete orphans.
 */
import { NextResponse } from "next/server";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  isB2Configured,
  listObjectKeys,
  deleteObjects,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_OBJECT_KEYS = 500_000;
const MAX_ORPHANS_PER_PREFIX = 10_000;

async function getReferencedKeys(): Promise<{
  content: Set<string>;
  proxies: Set<string>;
  thumbnails: Set<string>;
}> {
  const db = getAdminFirestore();
  const content = new Set<string>();
  const proxies = new Set<string>();
  const thumbnails = new Set<string>();
  let lastDoc: DocumentSnapshot | null = null;

  while (true) {
    let q = db.collection("backup_files").orderBy("__name__").limit(5000);
    if (lastDoc) {
      q = q.startAfter(lastDoc) as typeof q;
    }
    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      const key = (d.data()?.object_key as string) ?? "";
      if (key) {
        content.add(key);
        proxies.add(getProxyObjectKey(key));
        thumbnails.add(getVideoThumbnailCacheKey(key));
      }
    }
    if (content.size >= MAX_OBJECT_KEYS) break;

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 5000) break;
  }

  return { content, proxies, thumbnails };
}

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isB2Configured()) {
    return NextResponse.json({ error: "B2 not configured" }, { status: 503 });
  }

  const referenced = await getReferencedKeys();
  const contentOrphans: string[] = [];
  const proxyOrphans: string[] = [];
  const thumbOrphans: string[] = [];

  for await (const key of listObjectKeys("content/", MAX_OBJECT_KEYS)) {
    if (!referenced.content.has(key)) {
      contentOrphans.push(key);
      if (contentOrphans.length >= MAX_ORPHANS_PER_PREFIX) break;
    }
  }

  for await (const key of listObjectKeys("proxies/", MAX_OBJECT_KEYS)) {
    if (!referenced.proxies.has(key)) {
      proxyOrphans.push(key);
      if (proxyOrphans.length >= MAX_ORPHANS_PER_PREFIX) break;
    }
  }

  for await (const key of listObjectKeys("thumbnails/", MAX_OBJECT_KEYS)) {
    if (!referenced.thumbnails.has(key)) {
      thumbOrphans.push(key);
      if (thumbOrphans.length >= MAX_ORPHANS_PER_PREFIX) break;
    }
  }

  const toDelete = [
    ...new Set([
      ...contentOrphans,
      ...contentOrphans.flatMap((k) => [
        getProxyObjectKey(k),
        getVideoThumbnailCacheKey(k),
      ]),
      ...proxyOrphans,
      ...thumbOrphans,
    ]),
  ];

  let deleted = 0;
  if (toDelete.length > 0) {
    try {
      await deleteObjects(toDelete);
      deleted = toDelete.length;
    } catch (err) {
      console.error("[orphan-cleanup-cron] Delete failed:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Delete failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    contentOrphans: contentOrphans.length,
    proxyOrphans: proxyOrphans.length,
    thumbOrphans: thumbOrphans.length,
    deleted,
  });
}
