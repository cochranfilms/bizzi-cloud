/**
 * POST /api/admin/storage/orphan-cleanup
 * Finds and optionally deletes B2 content/ objects not referenced by backup_files.
 * Body: { dry_run?: boolean }
 * - dry_run: true (default) — report orphans only, do not delete
 * - dry_run: false — delete orphan objects from B2
 *
 * Admin only. May be slow for large buckets.
 */
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  isB2Configured,
  listObjectKeys,
  deleteObjects,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { NextResponse } from "next/server";

const MAX_OBJECT_KEYS = 500_000;
const MAX_ORPHANS_TO_DELETE = 10_000;

async function getReferencedObjectKeys(): Promise<Set<string>> {
  const db = getAdminFirestore();
  const keys = new Set<string>();
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
      if (key) keys.add(key);
    }
    if (keys.size >= MAX_OBJECT_KEYS) break;

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 5000) break;
  }

  return keys;
}

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!isB2Configured()) {
    return NextResponse.json({ error: "B2 not configured" }, { status: 503 });
  }

  let body: { dry_run?: boolean };
  try {
    body = (await request.json()) as { dry_run?: boolean };
  } catch {
    body = {};
  }
  const dryRun = body.dry_run !== false;

  const referenced = await getReferencedObjectKeys();
  const orphans: string[] = [];
  let checked = 0;

  for await (const key of listObjectKeys("content/", MAX_OBJECT_KEYS)) {
    checked++;
    if (!referenced.has(key)) {
      orphans.push(key);
      if (orphans.length >= MAX_ORPHANS_TO_DELETE) break;
    }
  }

  const orphanBytes = 0; // We'd need to fetch Size per object to sum; skip for now
  let deleted = 0;

  if (!dryRun && orphans.length > 0) {
    const toDelete: string[] = [];
    const seen = new Set<string>();
    for (const key of orphans) {
      toDelete.push(key);
      const proxyKey = getProxyObjectKey(key);
      const thumbKey = getVideoThumbnailCacheKey(key);
      if (!seen.has(proxyKey)) {
        toDelete.push(proxyKey);
        seen.add(proxyKey);
      }
      if (!seen.has(thumbKey)) {
        toDelete.push(thumbKey);
        seen.add(thumbKey);
      }
    }
    try {
      await deleteObjects(toDelete);
      deleted = toDelete.length;
    } catch (err) {
      console.error("[orphan-cleanup] Delete failed:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Delete failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    dryRun,
    referencedCount: referenced.size,
    checked,
    orphanCount: orphans.length,
    orphanKeys: dryRun ? orphans.slice(0, 100) : undefined,
    deleted,
  });
}
