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
  const driveId = searchParams.get("drive_id") ?? searchParams.get("drive") ?? undefined;
  const galleryId = searchParams.get("gallery_id") ?? searchParams.get("gallery") ?? undefined;
  const mediaType = searchParams.get("media_type") ?? undefined;
  const dateFrom = searchParams.get("date_from") ?? undefined;
  const dateTo = searchParams.get("date_to") ?? undefined;
  const sizeMin = searchParams.get("size_min");
  const sizeMax = searchParams.get("size_max");
  const search = searchParams.get("search") ?? undefined;
  const tags = searchParams.get("tags") ?? undefined;
  const resolution = searchParams.get("resolution") ?? searchParams.get("photo_resolution") ?? undefined;
  const codec = searchParams.get("codec") ?? undefined;
  const starred = searchParams.get("starred");
  const usageStatus = searchParams.get("usage_status") ?? undefined;
  const aspectRatio = searchParams.get("aspect_ratio") ?? searchParams.get("photo_aspect_ratio") ?? undefined;
  const fileType = searchParams.get("file_type") ?? searchParams.get("photo_file_type") ?? undefined;
  const fileTypes = [
    ...searchParams.getAll("file_type"),
    ...searchParams.getAll("photo_file_type"),
  ].filter(Boolean);
  const frameRate = searchParams.get("frame_rate") ?? undefined;
  const duration = searchParams.get("duration") ?? undefined;
  const container = searchParams.get("container") ?? undefined;
  const audio = searchParams.get("audio") ?? undefined;
  const audioChannels = searchParams.get("audio_channels") ?? undefined;
  const colorProfile = searchParams.get("color_profile") ?? searchParams.get("video_color_profile") ?? searchParams.get("photo_color_profile") ?? undefined;
  const bitDepth = searchParams.get("bit_depth") ?? searchParams.get("video_bit_depth") ?? searchParams.get("photo_bit_depth") ?? undefined;
  const orientation = searchParams.get("orientation") ?? undefined;
  const rawFormat = searchParams.get("raw_format") ?? undefined;
  const cameraModel = searchParams.get("camera_model") ?? undefined;
  const lens = searchParams.get("lens") ?? undefined;
  const editedStatus = searchParams.get("edited_status") ?? undefined;
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
    tags,
    resolution,
    codec,
    starred: starred === "true",
    usageStatus,
    aspectRatio,
    fileType: fileType || (fileTypes.length === 1 ? fileTypes[0] : undefined),
    fileTypes: fileTypes.length > 0 ? fileTypes : undefined,
    frameRate,
    duration,
    container,
    audio,
    audioChannels,
    colorProfile,
    bitDepth,
    orientation,
    rawFormat,
    cameraModel,
    lens,
    editedStatus,
    sort,
    cursor,
    pageSize,
  };
}

/** Compute aspect ratio string from dimensions (e.g. 1080x1920 -> "9:16") */
function getAspectRatioString(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw <= 21 && rh <= 21) return `${rw}:${rh}`;
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 4 / 5) < 0.05) return "4:5";
  if (Math.abs(ratio - 3 / 2) < 0.05) return "3:2";
  if (Math.abs(ratio - 2 / 3) < 0.05) return "3:2";
  if (Math.abs(ratio - 4 / 3) < 0.05) return "4:3";
  if (Math.abs(ratio - 3 / 4) < 0.05) return "4:3";
  if (Math.abs(ratio - 21 / 9) < 0.05) return "21:9";
  return `${rw}:${rh}`;
}

/** Match duration_sec against filter value (e.g. "0-30", "30-120", "1800+") */
function matchesDurationRange(durationSec: number | null | undefined, range: string): boolean {
  if (durationSec == null) return false;
  if (range === "1800+") return durationSec >= 1800;
  const [lo, hi] = range.split("-").map((x) => parseInt(x, 10));
  if (isNaN(lo) || isNaN(hi)) return false;
  return durationSec >= lo && durationSec < hi;
}

/** Match frame_rate with tolerance for float values */
function matchesFrameRate(itemRate: number | null | undefined, want: string): boolean {
  if (itemRate == null) return false;
  const wantNum = parseFloat(want);
  if (isNaN(wantNum)) return false;
  return Math.abs(itemRate - wantNum) < 0.1;
}

/** Apply in-memory filters that Firestore cannot handle */
function passesPostFilters(
  item: Record<string, unknown>,
  filters: ReturnType<typeof parseFilters>
): boolean {
  if (filters.resolution) {
    const parts = filters.resolution.split(/[x×]/i);
    const w = parseInt(parts[0], 10);
    const h = parts[1] ? parseInt(parts[1], 10) : NaN;
    if (!isNaN(w) && !isNaN(h)) {
      const rw = (item.resolution_w ?? item.width) as number | undefined;
      const rh = (item.resolution_h ?? item.height) as number | undefined;
      const matchLandscape = rw === w && rh === h;
      const matchPortrait = rw === h && rh === w;
      if (!matchLandscape && !matchPortrait) return false;
    }
  }
  if (filters.aspectRatio) {
    const rw = (item.resolution_w ?? item.width) as number | undefined;
    const rh = (item.resolution_h ?? item.height) as number | undefined;
    if (rw == null || rh == null) return false;
    const itemRatio = getAspectRatioString(rw, rh);
    if (itemRatio !== filters.aspectRatio) return false;
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
  if (filters.tags) {
    const itemTags = (item.tags as string[] | undefined) ?? [];
    const wantTags = filters.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const itemTagsLower = itemTags.map((t) => t.toLowerCase());
    const hasAll = wantTags.every((t) => itemTagsLower.some((it) => it.includes(t) || it === t));
    if (!hasAll) return false;
  }
  if (filters.starred && !(item.is_starred as boolean)) return false;
  const getDateStr = (raw: unknown): string | undefined => {
    if (typeof raw === "string") return raw.slice(0, 10);
    const r = raw as { toDate?: () => Date } | undefined;
    return r?.toDate?.()?.toISOString?.()?.slice(0, 10);
  };
  if (filters.dateFrom) {
    const m = getDateStr(item.modified_at ?? item.created_at);
    if (!m || m < filters.dateFrom) return false;
  }
  if (filters.dateTo) {
    const m = getDateStr(item.modified_at ?? item.created_at);
    if (!m || m > filters.dateTo) return false;
  }
  if (filters.sizeMin != null && filters.sizeMin >= 0) {
    const sz = (item.size_bytes ?? item.size) as number | undefined;
    if (sz == null || sz < filters.sizeMin) return false;
  }
  if (filters.sizeMax != null && filters.sizeMax > 0) {
    const sz = (item.size_bytes ?? item.size) as number | undefined;
    if (sz == null || sz > filters.sizeMax) return false;
  }
  // file_type / content_type (supports multi-select)
  if (filters.fileTypes?.length) {
    const ct = String((item.content_type as string) ?? "").toLowerCase();
    const rawFmt = String((item.raw_format as string) ?? "").toLowerCase();
    const hasMatch = filters.fileTypes.some((ft) => {
      const v = ft.toLowerCase();
      if (v === "raw") return !!rawFmt || ct.includes("raw") || /\.(cr2|cr3|nef|arw|raf|orf|rw2|dng|raw)$/i.test(String(item.relative_path ?? ""));
      return ct === v || ct.includes(v.split("/")[1] ?? v);
    });
    if (!hasMatch) return false;
  } else if (filters.fileType) {
    const ct = String((item.content_type as string) ?? "").toLowerCase();
    const rawFmt = String((item.raw_format as string) ?? "").toLowerCase();
    const v = filters.fileType.toLowerCase();
    if (v === "raw") {
      if (!rawFmt && !ct.includes("raw") && !/\.(cr2|cr3|nef|arw|raf|orf|rw2|dng|raw)$/i.test(String(item.relative_path ?? ""))) return false;
    } else if (ct !== v && !ct.includes(v.split("/")[1] ?? v)) return false;
  }
  if (filters.frameRate) {
    const fr = item.frame_rate as number | undefined;
    if (!matchesFrameRate(fr, filters.frameRate)) return false;
  }
  if (filters.duration) {
    const dur = item.duration_sec as number | undefined;
    if (!matchesDurationRange(dur, filters.duration)) return false;
  }
  if (filters.container) {
    const cf = String((item.container_format as string) ?? "").toLowerCase();
    const want = filters.container.toLowerCase();
    if (!cf.includes(want) && cf !== want) return false;
  }
  if (filters.audio === "yes") {
    if (!(item.has_audio as boolean)) return false;
  } else if (filters.audio === "no") {
    if (item.has_audio as boolean) return false;
  }
  if (filters.audioChannels) {
    const ch = item.audio_channels as number | undefined;
    const want = parseInt(filters.audioChannels, 10);
    if (ch != null && ch !== want) return false;
  }
  if (filters.colorProfile) {
    const cp = String((item.color_profile as string) ?? "").toLowerCase();
    const want = filters.colorProfile.toLowerCase();
    if (!cp.includes(want) && cp !== want) return false;
  }
  if (filters.bitDepth) {
    const bd = item.bit_depth as number | undefined;
    const want = parseInt(filters.bitDepth, 10);
    if (bd != null && bd !== want) return false;
  }
  if (filters.orientation) {
    const o = String((item.orientation as string) ?? "");
    if (o !== filters.orientation) return false;
  }
  if (filters.rawFormat) {
    const rf = String((item.raw_format as string) ?? "").toLowerCase();
    const want = filters.rawFormat.toLowerCase();
    if (!rf.includes(want) && rf !== want) return false;
  }
  if (filters.cameraModel) {
    const cm = String((item.camera_model as string) ?? "").toLowerCase();
    const want = filters.cameraModel.toLowerCase();
    if (!cm.includes(want)) return false;
  }
  if (filters.lens) {
    const li = String((item.lens_info as string) ?? "").toLowerCase();
    const want = filters.lens.toLowerCase();
    if (!li.includes(want)) return false;
  }
  if (filters.editedStatus) {
    const es = String((item.edited_status as string) ?? "");
    if (es !== filters.editedStatus) return false;
  }
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

  try {
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
  const resolutionPair = (() => {
    if (!filters.resolution) return null;
    const parts = filters.resolution.split(/[x×]/i);
    const w = parseInt(parts[0], 10);
    const h = parts[1] ? parseInt(parts[1], 10) : NaN;
    return !isNaN(w) && !isNaN(h) ? ([w, h] as const) : null;
  })();
  const orderField =
    filters.sort === "newest" || filters.sort === "oldest"
      ? "modified_at"
      : filters.sort === "largest" || filters.sort === "smallest"
        ? "size_bytes"
        : "relative_path";
  const orderDir =
    filters.sort === "oldest" || filters.sort === "smallest" ? "asc" : "desc";
  if (orderField === "modified_at" && (filters.dateFrom || filters.dateTo)) {
    if (filters.dateFrom) q = q.where("modified_at", ">=", filters.dateFrom);
    if (filters.dateTo) q = q.where("modified_at", "<=", filters.dateTo);
  } else if (orderField === "size_bytes" && (filters.sizeMin != null || filters.sizeMax != null)) {
    if (filters.sizeMin != null && filters.sizeMin >= 0) q = q.where("size_bytes", ">=", filters.sizeMin);
    if (filters.sizeMax != null && filters.sizeMax > 0) q = q.where("size_bytes", "<=", filters.sizeMax);
  }
  q = q.orderBy(orderField, orderDir);
  const needsPostFilter =
    !!filters.resolution ||
    !!filters.codec ||
    !!filters.search ||
    !!filters.tags ||
    !!filters.aspectRatio ||
    !!filters.fileType ||
    (filters.fileTypes?.length ?? 0) > 0 ||
    !!filters.frameRate ||
    !!filters.duration ||
    !!filters.container ||
    !!filters.audio ||
    !!filters.audioChannels ||
    !!filters.colorProfile ||
    !!filters.bitDepth ||
    !!filters.orientation ||
    !!filters.rawFormat ||
    !!filters.cameraModel ||
    !!filters.lens ||
    !!filters.editedStatus ||
    (orderField !== "modified_at" && (!!filters.dateFrom || !!filters.dateTo)) ||
    (orderField !== "size_bytes" && ((filters.sizeMin != null && filters.sizeMin >= 0) || (filters.sizeMax != null && filters.sizeMax > 0)));
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const code = (err as { code?: string })?.code;
    console.error("[api/files/filter] Error:", { msg, code, stack });
    const isIndexError =
      code === "FAILED_PRECONDITION" ||
      (typeof msg === "string" &&
        (msg.includes("index") || msg.includes("FAILED_PRECONDITION")));
    const errorResponse: Record<string, string> = {
      error: isIndexError
        ? "Filter requires Firestore index. Run: firebase deploy --only firestore:indexes (indexes may take a few minutes to build)"
        : msg,
    };
    if (isIndexError && msg) errorResponse.detail = msg;
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
