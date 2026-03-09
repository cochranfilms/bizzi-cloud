/**
 * GET /api/files/filter
 * Returns paginated backup_files matching filter params.
 * Firestore handles base filters; complex filters applied in-memory.
 */
import type {
  QueryDocumentSnapshot,
  Query,
} from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const PAGE_SIZE = 50;
const MAX_FETCH_FOR_POST_FILTER = 200;

type SortOption = "newest" | "oldest" | "largest" | "smallest" | "name_asc";

function parseFilters(searchParams: URLSearchParams) {
  const driveId = searchParams.get("drive_id") ?? undefined;
  const galleryId = searchParams.get("gallery_id") ?? undefined;
  const mediaType = searchParams.get("media_type") ?? undefined;
  const dateFrom = searchParams.get("date_from") ?? undefined;
  const dateTo = searchParams.get("date_to") ?? undefined;
  const sizeMin = searchParams.get("size_min");
  const sizeMax = searchParams.get("size_max");
  const search = searchParams.get("search") ?? undefined;
  const resolution = searchParams.get("resolution") ?? undefined;
  const codec = searchParams.get("codec") ?? undefined;
  const starred = searchParams.get("starred");
  const usageStatus = searchParams.get("usage_status") ?? undefined;
  const sort = (searchParams.get("sort") as SortOption) ?? "newest";
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSize = Math.min(
    parseInt(searchParams.get("page_size") ?? String(PAGE_SIZE), 10) || PAGE_SIZE,
    100
  );
  return {
    driveId,
    galleryId,
    mediaType,
    dateFrom,
    dateTo,
    sizeMin: sizeMin ? parseInt(sizeMin, 10) : undefined,
    sizeMax: sizeMax ? parseInt(sizeMax, 10) : undefined,
    search,
    resolution,
    codec,
    starred: starred === "true",
    usageStatus,
    sort,
    cursor,
    pageSize,
  };
}

/** Apply in-memory filters that Firestore cannot handle */
function passesPostFilters(
  item: Record<string, unknown>,
  filters: ReturnType<typeof parseFilters>
): boolean {
  if (filters.resolution) {
    const [w, h] = filters.resolution.split("x").map(Number);
    const rw = (item.resolution_w ?? item.width) as number | undefined;
    const rh = (item.resolution_h ?? item.height) as number | undefined;
    if (rw !== w || rh !== h) return false;
  }
  if (filters.codec) {
    const vc = String((item.video_codec as string) ?? "").toLowerCase();
    const want = filters.codec.toLowerCase();
    if (!vc.includes(want) && want !== vc) return false;
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    const path = String((item.relative_path ?? "") as string).toLowerCase();
    const name = path.split("/").pop() ?? "";
    if (!path.includes(term) && !name.includes(term)) return false;
  }
  if (filters.starred && !(item.is_starred as boolean)) return false;
  return true;
}

/** Map Firestore doc to API response shape */
function toFileResponse(
  doc: QueryDocumentSnapshot,
  driveMap: Map<string, string>
): Record<string, unknown> {
  const d = doc.data();
  const path = (d.relative_path as string) ?? "";
  const name = path.split("/").filter(Boolean).pop() ?? path ?? "?";
  return {
    id: doc.id,
    name,
    path,
    objectKey: d.object_key ?? "",
    size: d.size_bytes ?? 0,
    modifiedAt: d.modified_at?.toDate?.()
      ? d.modified_at.toDate().toISOString()
      : typeof d.modified_at === "string"
        ? d.modified_at
        : null,
    driveId: d.linked_drive_id,
    driveName: driveMap.get(d.linked_drive_id as string) ?? "Unknown",
    contentType: d.content_type ?? null,
    galleryId: d.gallery_id ?? null,
    mediaType: d.media_type ?? null,
    resolution_w: d.resolution_w ?? null,
    resolution_h: d.resolution_h ?? null,
    video_codec: d.video_codec ?? null,
    duration_sec: d.duration_sec ?? null,
    width: d.width ?? null,
    height: d.height ?? null,
    orientation: d.orientation ?? null,
    is_starred: d.is_starred ?? false,
    usage_status: d.usage_status ?? null,
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);

  const db = getAdminFirestore();
  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", uid)
    .get();
  const driveMap = new Map<string, string>();
  drivesSnap.docs.forEach((d) => {
    const data = d.data();
    if (!data.deleted_at) driveMap.set(d.id, data.name ?? "Folder");
  });
  const driveIds = new Set(driveMap.keys());

  let q: Query = db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("deleted_at", "==", null);

  if (filters.driveId && driveIds.has(filters.driveId)) {
    q = q.where("linked_drive_id", "==", filters.driveId);
  }
  if (filters.galleryId) {
    q = q.where("gallery_id", "==", filters.galleryId);
  }
  if (filters.mediaType) {
    q = q.where("media_type", "==", filters.mediaType);
  }
  if (filters.usageStatus) {
    q = q.where("usage_status", "==", filters.usageStatus);
  }
  if (filters.starred) {
    q = q.where("is_starred", "==", true);
  }
  if (filters.sizeMin != null && filters.sizeMin >= 0) {
    q = q.where("size_bytes", ">=", filters.sizeMin);
  }
  if (filters.sizeMax != null && filters.sizeMax > 0) {
    q = q.where("size_bytes", "<=", filters.sizeMax);
  }
  if (filters.dateFrom) {
    q = q.where("modified_at", ">=", filters.dateFrom);
  }
  if (filters.dateTo) {
    q = q.where("modified_at", "<=", filters.dateTo);
  }

  const orderField =
    filters.sort === "newest" || filters.sort === "oldest"
      ? "modified_at"
      : filters.sort === "largest" || filters.sort === "smallest"
        ? "size_bytes"
        : "relative_path";
  const orderDir =
    filters.sort === "oldest" || filters.sort === "smallest" ? "asc" : "desc";
  q = q.orderBy(orderField, orderDir);

  const needsPostFilter =
    !!filters.resolution || !!filters.codec || !!filters.search;
  const fetchLimit = needsPostFilter ? MAX_FETCH_FOR_POST_FILTER : filters.pageSize;

  if (filters.cursor) {
    try {
      const cursorDoc = await db.collection("backup_files").doc(filters.cursor).get();
      if (cursorDoc.exists) {
        q = q.startAfter(cursorDoc);
      }
    } catch {
      // Invalid cursor, ignore
    }
  }
  q = q.limit(fetchLimit);

  const snap = await q.get();
  const driveFilter = (d: QueryDocumentSnapshot) =>
    driveIds.has(d.data().linked_drive_id as string);

  let filteredDocs = snap.docs.filter(driveFilter);
  if (needsPostFilter) {
    filteredDocs = filteredDocs.filter((doc) => {
      const item = { ...doc.data(), id: doc.id } as Record<string, unknown>;
      return passesPostFilters(item, filters);
    });
  }

  const page = filteredDocs.slice(0, filters.pageSize);
  const lastDoc = page[page.length - 1];
  const hasMore = filteredDocs.length > filters.pageSize;

  const files = page.map((d) => toFileResponse(d, driveMap));

  return NextResponse.json({
    files,
    totalCount: filteredDocs.length,
    hasMore,
    cursor: hasMore && lastDoc ? lastDoc.id : null,
  });
}
