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
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-access";
import { resolveEnterprisePillarDriveIds } from "@/lib/org-pillar-drives";
import { assertStorageLifecycleAllowsAccess } from "@/lib/storage-lifecycle";
import {
  fileBelongsToPersonalTeamContainer,
  fileVisibleOnPersonalDashboard,
  isPersonalDashboardDriveDoc,
  isTeamContainerDriveDoc,
} from "@/lib/backup-scope";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { isCreativeProjectFilterMatch } from "@/lib/creative-file-registry";
import { isImageFile, isVideoFile } from "@/lib/bizzi-file-types";
import {
  BACKUP_LIFECYCLE_ACTIVE,
  isBackupFileActiveForListing,
} from "@/lib/backup-file-lifecycle";
import { NextResponse } from "next/server";

const PAGE_SIZE = 50;
const MAX_FETCH_FOR_POST_FILTER = 200;

type SortOption = "newest" | "oldest" | "largest" | "smallest" | "name_asc" | "name_desc";

/** When filtering by date range, rank by upload time so “Recent” matches real ingest order (not camera mtime). */
function timeRankFieldForSort(filters: {
  sort: SortOption;
  dateFrom?: string;
  dateTo?: string;
}): "modified_at" | "uploaded_at" {
  const hasDate = !!(filters.dateFrom || filters.dateTo);
  if (hasDate && (filters.sort === "newest" || filters.sort === "oldest")) {
    return "uploaded_at";
  }
  return "modified_at";
}

function parseFilters(searchParams: URLSearchParams) {
  const context = searchParams.get("context") ?? undefined;
  const organizationId = searchParams.get("organization_id")?.trim() || null;
  const teamOwnerUserId = searchParams.get("team_owner_id")?.trim() || null;
  const driveId = searchParams.get("drive_id") ?? searchParams.get("drive") ?? undefined;
  const galleryId = searchParams.get("gallery_id") ?? searchParams.get("gallery") ?? undefined;
  const mediaType = searchParams.get("media_type") ?? undefined;
  const mediaTypes = searchParams.getAll("media_type").filter(Boolean);
  const assetType = searchParams.get("asset_type") ?? undefined;
  const assetTypes = searchParams.getAll("asset_type").filter(Boolean);
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
  const shared = searchParams.get("shared");
  const commented = searchParams.get("commented");
  const creativeProjects =
    searchParams.get("creative_projects") === "true" ||
    searchParams.get("creative_projects") === "1";
  const workspaceId = searchParams.get("workspace_id")?.trim() || null;
  const VALID_SORTS: SortOption[] = ["newest", "oldest", "largest", "smallest", "name_asc", "name_desc"];
  const rawSort = (searchParams.get("sort") ?? "newest").split(/[:]/)[0]?.trim() || "newest";
  const sort = (VALID_SORTS.includes(rawSort as SortOption) ? rawSort : "newest") as SortOption;
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSize = Math.min(
    parseInt(searchParams.get("page_size") ?? String(PAGE_SIZE), 10) || PAGE_SIZE,
    120
  );
  return {
    context,
    organizationId,
    teamOwnerUserId,
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
    shared: shared === "true",
    commented: commented === "true",
    mediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
    assetType: assetType || undefined,
    assetTypes: assetTypes.length > 0 ? assetTypes : undefined,
    sort,
    cursor,
    pageSize,
    creativeProjects,
    workspaceId,
  };
}

/** Batch query path cannot apply these in Firestore; refine in memory like the main path. */
function mustRefineInMemoryForBatchQuery(filters: ReturnType<typeof parseFilters>): boolean {
  return !!(
    filters.mediaTypes?.length ||
    filters.mediaType ||
    filters.assetTypes?.length ||
    filters.assetType ||
    filters.usageStatus ||
    filters.galleryId ||
    filters.starred
  );
}

function mediaTypeWantsList(filters: {
  mediaTypes?: string[];
  mediaType?: string;
}): string[] {
  const out: string[] = filters.mediaTypes?.length ? [...filters.mediaTypes] : [];
  if (filters.mediaType && !out.includes(filters.mediaType)) out.push(filters.mediaType);
  return out;
}

function itemMatchesMediaTypeWants(item: Record<string, unknown>, wants: string[]): boolean {
  if (wants.length === 0) return true;
  const mt = String((item.media_type as string) ?? "").toLowerCase();
  const ct = String((item.content_type as string) ?? item.mime_type ?? "").toLowerCase();
  const path = String((item.relative_path as string) ?? "");
  const base = path.split("/").filter(Boolean).pop() ?? path;

  return wants.some((w) => {
    const x = w.toLowerCase();
    if (x === "video") {
      if (mt === "video") return true;
      if (ct.startsWith("video/")) return true;
      return base.length > 0 && isVideoFile(base);
    }
    if (x === "photo") {
      if (mt === "photo") return true;
      if (ct.startsWith("image/")) return true;
      return base.length > 0 && isImageFile(base);
    }
    return mt === x;
  });
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

type FiltersWithIds = ReturnType<typeof parseFilters> & {
  sharedFileIds?: Set<string>;
  commentedFileIds?: Set<string>;
};

/** Calendar day (yyyy-mm-dd) for date presets: upload time first, then file mtime, then row created. */
function filterItemCalendarDay(item: Record<string, unknown>): string | undefined {
  const day = (raw: unknown): string | undefined => {
    if (typeof raw === "string") return raw.slice(0, 10);
    const r = raw as { toDate?: () => Date } | undefined;
    return r?.toDate?.()?.toISOString?.()?.slice(0, 10);
  };
  return day(item.uploaded_at) ?? day(item.modified_at) ?? day(item.created_at);
}

/** Apply in-memory filters that Firestore cannot handle */
function passesPostFilters(
  item: Record<string, unknown>,
  filters: FiltersWithIds
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
  if (filters.dateFrom) {
    const m = filterItemCalendarDay(item);
    if (!m || m < filters.dateFrom) return false;
  }
  if (filters.dateTo) {
    const m = filterItemCalendarDay(item);
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
  if (filters.shared) {
    const set = (filters as FiltersWithIds).sharedFileIds;
    if (!set?.has(String(item.id ?? ""))) return false;
  }
  if (filters.commented) {
    const set = (filters as FiltersWithIds).commentedFileIds;
    if (!set?.has(String(item.id ?? ""))) return false;
  }
  if (filters.usageStatus) {
    if (String((item.usage_status as string) ?? "") !== filters.usageStatus) return false;
  }
  if (filters.galleryId) {
    if (String((item.gallery_id as string) ?? "") !== filters.galleryId) return false;
  }
  const mediaWants = mediaTypeWantsList(filters);
  const creativeQuick = filters.creativeProjects === true;
  if (creativeQuick && mediaWants.length > 0) {
    const mediaOk = itemMatchesMediaTypeWants(item, mediaWants);
    const creativeOk = isCreativeProjectFilterMatch(item);
    if (!mediaOk && !creativeOk) return false;
  } else {
    if (mediaWants.length > 0 && !itemMatchesMediaTypeWants(item, mediaWants)) return false;
    if (creativeQuick && !isCreativeProjectFilterMatch(item)) return false;
  }
  if (filters.assetTypes?.length) {
    const at = String((item.asset_type as string) ?? "").toLowerCase();
    const hasMatch = filters.assetTypes.some((a) => a.toLowerCase() === at);
    if (!hasMatch) return false;
  } else if (filters.assetType) {
    const at = String((item.asset_type as string) ?? "").toLowerCase();
    if (at !== String(filters.assetType).toLowerCase()) return false;
  }
  return true;
}

/** Map Firestore doc to API response shape */
function toFileResponse(
  doc: QueryDocumentSnapshot,
  driveMap: Map<string, string>,
  options?: { includeAdminFields?: boolean }
): Record<string, unknown> {
  const d = doc.data();
  const path = (d.relative_path as string) ?? "";
  const name = path.split("/").filter(Boolean).pop() ?? path ?? "?";
  const derivedPkg = macosPackageFirestoreFieldsFromRelativePath(path);
  const base: Record<string, unknown> = {
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
    uploadedAt: d.uploaded_at?.toDate?.()
      ? d.uploaded_at.toDate().toISOString()
      : typeof d.uploaded_at === "string"
        ? d.uploaded_at
        : null,
    createdAt: d.created_at?.toDate?.()
      ? d.created_at.toDate().toISOString()
      : typeof d.created_at === "string"
        ? d.created_at
        : null,
    proxyDurationSec:
      typeof d.proxy_duration_sec === "number" && Number.isFinite(d.proxy_duration_sec)
        ? d.proxy_duration_sec
        : null,
    driveId: d.linked_drive_id,
    driveName: driveMap.get(d.linked_drive_id as string) ?? "Unknown",
    contentType: d.content_type ?? null,
    assetType: d.asset_type ?? null,
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
    macos_package_kind:
      (d.macos_package_kind as string | undefined) ?? derivedPkg.macos_package_kind ?? null,
    macos_package_root_relative_path:
      (d.macos_package_root_relative_path as string | undefined) ??
      derivedPkg.macos_package_root_relative_path ??
      null,
    macos_package_id: (d.macos_package_id as string | undefined) ?? null,
    proxyStatus: d.proxy_status ?? null,
    handlingModel: (d.handling_model as string | undefined) ?? null,
    creativeApp: (d.creative_app as string | undefined) ?? null,
    creativeDisplayLabel: (d.creative_display_label as string | undefined) ?? null,
    projectFileType: (d.project_file_type as string | undefined) ?? null,
  };
  if (options?.includeAdminFields) {
    base.owner_user_id = d.owner_user_id ?? d.userId ?? null;
    base.workspace_id = d.workspace_id ?? null;
    base.visibility_scope = d.visibility_scope ?? null;
  }
  return base;
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

  const rl = checkRateLimit(`files-filter:${uid}`, 300, 60_000); // burst-friendly during large uploads + UI refetch
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    await assertStorageLifecycleAllowsAccess(uid);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Access restricted" },
      { status: 403 }
    );
  }

  try {
  const url = new URL(request.url);
  const db = getAdminFirestore();
  const filters = parseFilters(url.searchParams) as ReturnType<typeof parseFilters> & {
    sharedFileIds?: Set<string>;
    commentedFileIds?: Set<string>;
  };

  const filtersWithIds = filters as FiltersWithIds;
  if (filters.shared) {
    const sharesSnap = await db
      .collection("folder_shares")
      .where("owner_id", "==", uid)
      .limit(500)
      .get();
    const sharedFileIds = new Set<string>();
    for (const d of sharesSnap.docs) {
      const data = d.data();
      (data.referenced_file_ids as string[] | undefined)?.forEach((id: string) => sharedFileIds.add(id));
      const backupId = data.backup_file_id as string | undefined;
      if (backupId) sharedFileIds.add(backupId);
    }
    filtersWithIds.sharedFileIds = sharedFileIds;
  }

  if (filters.commented) {
    // Scope to user's files only — avoid loading all comments globally (fails at scale)
    const userFileIdsSnap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .limit(1000)
      .get();
    const userFileIds = userFileIdsSnap.docs
      .filter((d) => isBackupFileActiveForListing(d.data() as Record<string, unknown>))
      .map((d) => d.id);
    const commentedFileIds = new Set<string>();
    const IN_BATCH = 30; // Firestore "in" limit
    for (let i = 0; i < userFileIds.length; i += IN_BATCH) {
      const batch = userFileIds.slice(i, i + IN_BATCH);
      const commentsSnap = await db
        .collection("file_comments")
        .where("fileId", "in", batch)
        .limit(100)
        .get();
      commentsSnap.docs.forEach((d) => {
        const fileId = d.data().fileId as string | undefined;
        if (fileId) commentedFileIds.add(fileId);
      });
    }
    filtersWithIds.commentedFileIds = commentedFileIds;
  }

  // Scope drives and files by context: enterprise = org only, personal = org_id null
  let orgFilter: string | null = null;
  if (filters.context === "enterprise" && filters.organizationId) {
    const access = await resolveEnterpriseAccess(uid, filters.organizationId, db);
    if (!access.canAccessEnterprise) {
      return NextResponse.json(
        { error: "Unauthorized to access this organization's files" },
        { status: 403 }
      );
    }
    orgFilter = filters.organizationId;
  } else {
    orgFilter = null; // personal: only organization_id null
  }

  const driveMap = new Map<string, string>();
  let driveIds = new Set<string>();

  if (orgFilter != null) {
    const drivesQuery = db
      .collection("linked_drives")
      .where("userId", "==", uid);
    const drivesSnap = await drivesQuery.where("organization_id", "==", orgFilter).get();
    drivesSnap.docs.forEach((d) => {
      const data = d.data();
      if (!data.deleted_at) {
        const oid = data.organization_id ?? null;
        if (oid === orgFilter) {
          driveMap.set(d.id, data.name ?? "Folder");
        }
      }
    });
    driveIds = new Set(driveMap.keys());
  } else if (filters.teamOwnerUserId) {
    const teamOwnerTarget = filters.teamOwnerUserId;
    if (uid !== teamOwnerTarget) {
      const seatSnap = await db
        .collection("personal_team_seats")
        .doc(`${teamOwnerTarget}_${uid}`)
        .get();
      const st = seatSnap.data()?.status as string | undefined;
      if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const teamDrivesSnap = await db
      .collection("linked_drives")
      .where("userId", "==", teamOwnerTarget)
      .get();
    for (const d of teamDrivesSnap.docs) {
      const data = d.data();
      if (data.deleted_at || data.organization_id) continue;
      if (!isTeamContainerDriveDoc(data as Record<string, unknown>, teamOwnerTarget)) continue;
      driveMap.set(d.id, (data.name as string) ?? "Folder");
      driveIds.add(d.id);
    }
  } else {
    const drivesQuery = db.collection("linked_drives").where("userId", "==", uid);
    const drivesSnap = await drivesQuery.get();
    drivesSnap.docs.forEach((d) => {
      const data = d.data();
      if (!data.deleted_at) {
        const oid = data.organization_id ?? null;
        if (
          !oid &&
          isPersonalDashboardDriveDoc(data as Record<string, unknown>, uid)
        ) {
          driveMap.set(d.id, data.name ?? "Folder");
        }
      }
    });
    driveIds = new Set(driveMap.keys());
  }

  // Enterprise: get accessible workspace IDs (workspace-based visibility)
  let accessibleWorkspaceIds: string[] = [];
  if (orgFilter != null) {
    accessibleWorkspaceIds = await getAccessibleWorkspaceIds(uid, orgFilter);
    // Include drives from workspaces user can access (for driveMap when files are in other members' drives)
    if (accessibleWorkspaceIds.length > 0) {
      const workspaceDocs = await Promise.all(
        accessibleWorkspaceIds.slice(0, 30).map((wid) =>
          db.collection("workspaces").doc(wid).get()
        )
      );
      const extraDriveIds = new Set<string>();
      for (const wsDoc of workspaceDocs) {
        const did = wsDoc.data()?.drive_id as string | undefined;
        if (did) extraDriveIds.add(did);
      }
      for (const did of extraDriveIds) {
        if (!driveMap.has(did)) {
          const dSnap = await db.collection("linked_drives").doc(did).get();
          if (dSnap.exists && !dSnap.data()?.deleted_at) {
            driveMap.set(did, (dSnap.data()?.name as string) ?? "Drive");
            driveIds.add(did);
          }
        }
      }
    }
  }

  /** When set, list/scoped queries only include this workspace (must be in the caller's accessible set). */
  let workspaceIdsForQuery = accessibleWorkspaceIds;
  if (orgFilter != null && filters.workspaceId) {
    if (!accessibleWorkspaceIds.includes(filters.workspaceId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    workspaceIdsForQuery = [filters.workspaceId];
  }

  let q: Query;

  if (orgFilter != null) {
    // Enterprise: workspace-based query (admin sees all; members see accessible workspaces only)
    const IN_LIMIT = 30; // Firestore "in" limit
    if (workspaceIdsForQuery.length === 0) {
      // No accessible workspaces: could be new member or pre-migration org. Fall back to legacy userId for backward compat.
      const anyWorkspaces = await db
        .collection("workspaces")
        .where("organization_id", "==", orgFilter)
        .limit(1)
        .get();
      if (anyWorkspaces.empty) {
        // Pre-migration: no workspaces exist yet, use legacy owner-based query
        q = db
          .collection("backup_files")
          .where("userId", "==", uid)
          .where("organization_id", "==", orgFilter)
          .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE);
      } else {
        // New member with no accessible workspaces - return empty
        return NextResponse.json({
          files: [],
          totalCount: 0,
          hasMore: false,
          cursor: null,
        });
      }
    } else if (workspaceIdsForQuery.length <= IN_LIMIT) {
      q = db
        .collection("backup_files")
        .where("organization_id", "==", orgFilter)
        .where("workspace_id", "in", workspaceIdsForQuery)
        .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE);
   } else {
      // Batch queries and merge (Phase 1: rare; most orgs have few workspaces)
      const batches = [];
      for (let i = 0; i < workspaceIdsForQuery.length; i += IN_LIMIT) {
        const batch = workspaceIdsForQuery.slice(i, i + IN_LIMIT);
        batches.push(
          db
            .collection("backup_files")
            .where("organization_id", "==", orgFilter)
            .where("workspace_id", "in", batch)
            .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
            .limit(MAX_FETCH_FOR_POST_FILTER * 2)
            .get()
        );
      }
      const results = await Promise.all(batches);
      const allDocs = results.flatMap((s) => s.docs);
      const orderField =
        filters.sort === "newest" || filters.sort === "oldest"
          ? timeRankFieldForSort(filters)
          : filters.sort === "largest" || filters.sort === "smallest"
            ? "size_bytes"
            : "relative_path";
      const orderDir =
        filters.sort === "oldest" || filters.sort === "smallest" || filters.sort === "name_asc"
          ? "asc"
          : "desc";
      allDocs.sort((a, b) => {
        const va = a.data()[orderField];
        const vb = b.data()[orderField];
        if (va == null && vb == null) return 0;
        if (va == null) return orderDir === "asc" ? -1 : 1;
        if (vb == null) return orderDir === "asc" ? 1 : -1;
        const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
        return orderDir === "asc" ? cmp : -cmp;
      });
      const driveFilter = (d: { data: () => Record<string, unknown> }) =>
        driveIds.has((d.data().linked_drive_id as string) ?? "");
      let filteredDocs = allDocs
        .filter(driveFilter)
        .filter((doc) => isBackupFileActiveForListing(doc.data() as Record<string, unknown>));
      const batchNeedsPostFilter =
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
        !!filters.shared ||
        !!filters.commented ||
        !!filters.dateFrom ||
        !!filters.dateTo ||
        !!filters.creativeProjects ||
        mustRefineInMemoryForBatchQuery(filters);
      if (batchNeedsPostFilter) {
        filteredDocs = filteredDocs.filter((doc) => {
          const item = { ...doc.data(), id: doc.id } as Record<string, unknown>;
          return passesPostFilters(item, filtersWithIds);
        });
      }
      const page = filteredDocs.slice(0, filters.pageSize);
      const lastDoc = page[page.length - 1];
      const hasMore = filteredDocs.length > filters.pageSize;
      const includeAdminFieldsBatch = (await resolveEnterpriseAccess(uid, orgFilter, db)).isAdmin;
      const files = page.map((d) =>
        toFileResponse(d as import("firebase-admin/firestore").QueryDocumentSnapshot, driveMap, {
          includeAdminFields: includeAdminFieldsBatch,
        })
      );
      return NextResponse.json({
        files,
        totalCount: filteredDocs.length,
        hasMore,
        cursor: hasMore && lastDoc ? lastDoc.id : null,
      });
    }
  } else {
    let idList =
      filters.driveId && driveIds.has(filters.driveId)
        ? [filters.driveId]
        : [...driveIds];
    if (idList.length === 0) {
      return NextResponse.json({
        files: [],
        totalCount: 0,
        hasMore: false,
        cursor: null,
      });
    }
    const PERSONAL_DRIVE_IN_LIMIT = 30;
    if (idList.length <= PERSONAL_DRIVE_IN_LIMIT) {
      q = db
        .collection("backup_files")
        .where("linked_drive_id", "in", idList)
        .where("organization_id", "==", null);
    } else {
      const batches = [];
      for (let i = 0; i < idList.length; i += PERSONAL_DRIVE_IN_LIMIT) {
        const batch = idList.slice(i, i + PERSONAL_DRIVE_IN_LIMIT);
        batches.push(
          db
            .collection("backup_files")
            .where("linked_drive_id", "in", batch)
            .where("organization_id", "==", null)
            .limit(MAX_FETCH_FOR_POST_FILTER * 2)
            .get()
        );
      }
      const results = await Promise.all(batches);
      const allDocs = results.flatMap((s) => s.docs);
      const orderFieldEarly =
        filters.sort === "newest" || filters.sort === "oldest"
          ? timeRankFieldForSort(filters)
          : filters.sort === "largest" || filters.sort === "smallest"
            ? "size_bytes"
            : "relative_path";
      const orderDirEarly =
        filters.sort === "oldest" || filters.sort === "smallest" || filters.sort === "name_asc"
          ? "asc"
          : "desc";
      allDocs.sort((a, b) => {
        const va = a.data()[orderFieldEarly];
        const vb = b.data()[orderFieldEarly];
        if (va == null && vb == null) return 0;
        if (va == null) return orderDirEarly === "asc" ? -1 : 1;
        if (vb == null) return orderDirEarly === "asc" ? 1 : -1;
        const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
        return orderDirEarly === "asc" ? cmp : -cmp;
      });
      const driveFilterPersonal = (d: { data: () => Record<string, unknown> }) =>
        driveIds.has((d.data().linked_drive_id as string) ?? "");
      let filteredDocs = allDocs
        .filter(driveFilterPersonal)
        .filter((doc) => isBackupFileActiveForListing(doc.data() as Record<string, unknown>))
        .filter((doc) =>
          filters.teamOwnerUserId
            ? fileBelongsToPersonalTeamContainer(
                doc.data() as Record<string, unknown>,
                filters.teamOwnerUserId
              )
            : fileVisibleOnPersonalDashboard(doc.data() as Record<string, unknown>, uid)
        );
      const batchNeedsPostFilter =
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
        !!filters.shared ||
        !!filters.commented ||
        !!filters.dateFrom ||
        !!filters.dateTo ||
        !!filters.creativeProjects ||
        mustRefineInMemoryForBatchQuery(filters);
      if (batchNeedsPostFilter) {
        filteredDocs = filteredDocs.filter((doc) => {
          const item = { ...doc.data(), id: doc.id } as Record<string, unknown>;
          return passesPostFilters(item, filtersWithIds);
        });
      }
      const page = filteredDocs.slice(0, filters.pageSize);
      const lastDoc = page[page.length - 1];
      const hasMore = filteredDocs.length > filters.pageSize;
      const files = page.map((d) =>
        toFileResponse(d as import("firebase-admin/firestore").QueryDocumentSnapshot, driveMap, {
          includeAdminFields: false,
        })
      );
      return NextResponse.json({
        files,
        totalCount: filteredDocs.length,
        hasMore,
        cursor: hasMore && lastDoc ? lastDoc.id : null,
      });
    }
  }

  if (filters.driveId && driveIds.has(filters.driveId)) {
    if (orgFilter != null) {
      const pillarIds = await resolveEnterprisePillarDriveIds(orgFilter, filters.driveId);
      for (const pid of pillarIds) {
        if (!driveMap.has(pid)) {
          const dSnap = await db.collection("linked_drives").doc(pid).get();
          if (dSnap.exists && !dSnap.data()?.deleted_at) {
            driveMap.set(pid, (dSnap.data()?.name as string) ?? "Drive");
            driveIds.add(pid);
          }
        }
      }
      const effective = pillarIds.filter((id) => driveIds.has(id));
      const idsForQuery = effective.length > 0 ? effective : [filters.driveId];
      if (idsForQuery.length === 1) {
        q = q.where("linked_drive_id", "==", idsForQuery[0]);
      } else if (idsForQuery.length <= 30) {
        q = q.where("linked_drive_id", "in", idsForQuery);
      } else {
        q = q.where("linked_drive_id", "==", filters.driveId);
      }
    } else {
      q = q.where("linked_drive_id", "==", filters.driveId);
    }
  }
  if (filters.galleryId) {
    q = q.where("gallery_id", "==", filters.galleryId);
  }
  if (filters.mediaTypes?.length) {
    if (filters.mediaTypes.length === 1) {
      q = q.where("media_type", "==", filters.mediaTypes[0]);
    } else if (filters.mediaTypes.length <= 30) {
      q = q.where("media_type", "in", filters.mediaTypes);
    } else {
      q = q.where("media_type", "in", filters.mediaTypes.slice(0, 30));
    }
  } else if (filters.mediaType) {
    q = q.where("media_type", "==", filters.mediaType);
  }
  if (filters.assetTypes?.length) {
    if (filters.assetTypes.length === 1) {
      q = q.where("asset_type", "==", filters.assetTypes[0]);
    } else if (filters.assetTypes.length <= 30) {
      q = q.where("asset_type", "in", filters.assetTypes);
    } else {
      q = q.where("asset_type", "in", filters.assetTypes.slice(0, 30));
    }
  } else if (filters.assetType) {
    q = q.where("asset_type", "==", filters.assetType);
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
      ? timeRankFieldForSort(filters)
      : filters.sort === "largest" || filters.sort === "smallest"
        ? "size_bytes"
        : "relative_path";
  const orderDir =
    filters.sort === "oldest" || filters.sort === "smallest" || filters.sort === "name_asc"
      ? "asc"
      : "desc";
  if (orderField === "size_bytes" && (filters.sizeMin != null || filters.sizeMax != null)) {
    if (filters.sizeMin != null && filters.sizeMin >= 0) q = q.where("size_bytes", ">=", filters.sizeMin);
    if (filters.sizeMax != null && filters.sizeMax > 0) q = q.where("size_bytes", "<=", filters.sizeMax);
  }
  q = q.orderBy(orderField, orderDir);
  const hasDateRangeFilter = !!(filters.dateFrom || filters.dateTo);
  const mediaWantsForPost = mediaTypeWantsList(filters);
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
    !!filters.shared ||
    !!filters.commented ||
    hasDateRangeFilter ||
    !!filters.creativeProjects ||
    mediaWantsForPost.length > 0 ||
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

  let filteredDocs = snap.docs
    .filter(driveFilter)
    .filter((d) => isBackupFileActiveForListing(d.data() as Record<string, unknown>));
    if (orgFilter == null) {
    if (filters.teamOwnerUserId) {
      const tow = filters.teamOwnerUserId;
      filteredDocs = filteredDocs.filter((doc) =>
        fileBelongsToPersonalTeamContainer(doc.data() as Record<string, unknown>, tow)
      );
    } else {
      filteredDocs = filteredDocs.filter((doc) =>
        fileVisibleOnPersonalDashboard(doc.data() as Record<string, unknown>, uid)
      );
    }
  }
  if (needsPostFilter) {
    filteredDocs = filteredDocs.filter((doc) => {
      const item = { ...doc.data(), id: doc.id } as Record<string, unknown>;
      return passesPostFilters(item, filtersWithIds);
    });
  }

  const page = filteredDocs.slice(0, filters.pageSize);
  const lastDoc = page[page.length - 1];
  const hasMore = filteredDocs.length > filters.pageSize;

  const includeAdminFields =
    orgFilter != null && (await resolveEnterpriseAccess(uid, orgFilter, db)).isAdmin;
  const files = page.map((d) => toFileResponse(d, driveMap, { includeAdminFields }));

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
