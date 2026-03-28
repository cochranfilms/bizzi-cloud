/**
 * Metadata display layer: normalized labels, applicability vs missing data, sort keys, folder rollups.
 * Does not perform extraction — only formats existing RecentFile / folder inputs.
 */

import type { RecentFile } from "@/hooks/useCloudFiles";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import {
  isArchiveFile,
  isDocumentFile,
  isImageFile,
  isProjectFile,
  isVideoFile,
} from "@/lib/bizzi-file-types";
import type { FolderItem } from "@/components/dashboard/FolderCard";

export type MetadataCompleteness = "full" | "derived" | "fallback";
export type FieldApplicability = "applicable" | "not_applicable";
export type FolderRollupCoverage = "full" | "partial" | "none";

/** Sentinel: no meaningful duration for sorting (non-timed). Keep sorts numeric, never use label strings. */
export const SORT_DURATION_NONE = -1;

export type LocationScopeHint = "personal" | "shared" | "enterprise" | "team";

export interface DisplayContext {
  workspaceLabel?: string | null;
  locationScope?: LocationScopeHint;
}

export interface DisplayMetadata {
  name: string;
  typeLabel: string;
  sizeLabel: string;
  modifiedLabel: string;
  locationLabel: string;
  resolutionLabel: string;
  durationLabel: string;
  codecLabel: string;
  sizeSortValue: number;
  modifiedSortValue: number;
  durationSortValue: number;
  applicability: {
    resolution: FieldApplicability;
    duration: FieldApplicability;
    codec: FieldApplicability;
  };
  completeness: {
    modified: MetadataCompleteness;
    resolution: MetadataCompleteness;
    duration: MetadataCompleteness;
    codec: MetadataCompleteness;
    location: MetadataCompleteness;
  };
  tooltips?: {
    modified?: string;
    resolution?: string;
    duration?: string;
    codec?: string;
    location?: string;
  };
}

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|aiff|aif|wma|opus)$/i;
const LUT_EXT = /\.(cube|3dl)$/i;

function isAudioFile(name: string, contentType?: string | null): boolean {
  const lower = name.toLowerCase();
  if (AUDIO_EXT.test(lower)) return true;
  if (contentType?.startsWith("audio/")) return true;
  return false;
}

function isLutFile(name: string): boolean {
  return LUT_EXT.test(name.toLowerCase());
}

export type FileKindCategory =
  | "video"
  | "photo"
  | "audio"
  | "document"
  | "archive"
  | "lut"
  | "project"
  | "macos_package"
  | "unknown";

export function classifyFileKind(file: RecentFile): FileKindCategory {
  const name = file.name;
  if (file.assetType === "macos_package" || file.id.startsWith("macos-pkg:")) {
    return "macos_package";
  }
  if (isLutFile(name)) return "lut";
  if (isArchiveFile(name)) return "archive";
  if (isVideoFile(name) || file.contentType?.startsWith("video/") || file.mediaType === "video") {
    return "video";
  }
  if (isAudioFile(name, file.contentType)) return "audio";
  if (
    GALLERY_IMAGE_EXT.test(name) ||
    file.contentType?.startsWith("image/") ||
    file.mediaType === "photo" ||
    isImageFile(name)
  ) {
    return "photo";
  }
  if (isDocumentFile(name) || /\.pdf$/i.test(name) || file.contentType === "application/pdf") {
    return "document";
  }
  if (isProjectFile(name) || file.assetType === "project_file" || file.creativeDisplayLabel?.trim()) {
    return "project";
  }
  return "unknown";
}

export function buildTypeLabel(file: RecentFile): string {
  if (file.creativeDisplayLabel?.trim()) return file.creativeDisplayLabel.trim();
  if (file.assetType === "macos_package") return "macOS package";
  if (file.macosPackageLabel?.trim()) return file.macosPackageLabel.trim();

  const cat = classifyFileKind(file);
  switch (cat) {
    case "macos_package":
      return "macOS package";
    case "video":
      return "Video";
    case "photo":
      return "Photo";
    case "audio":
      return "Audio";
    case "document":
      return "Document";
    case "archive":
      return "Archive";
    case "lut":
      return "LUT";
    case "project":
      return "Project file";
    default:
      return "Unknown file";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatLocaleDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function bestFileTimestampMs(file: RecentFile): { ms: number | null; iso: string | null; source: "modified" | "created" | "uploaded" | null } {
  const m = parseIsoMs(file.modifiedAt);
  if (m != null) return { ms: m, iso: file.modifiedAt!, source: "modified" };
  const c = parseIsoMs(file.createdAt ?? null);
  if (c != null) return { ms: c, iso: file.createdAt!, source: "created" };
  const u = parseIsoMs(file.uploadedAt ?? null);
  if (u != null) return { ms: u, iso: file.uploadedAt!, source: "uploaded" };
  return { ms: null, iso: null, source: null };
}

export function resolveLocationLabel(file: RecentFile, ctx?: DisplayContext): string {
  const d = file.driveName?.trim();
  if (d) return d;
  return resolveContextLocationFallback(ctx);
}

export function resolveContextLocationFallback(ctx?: DisplayContext): string {
  const w = ctx?.workspaceLabel?.trim();
  if (w) return w;
  if (ctx?.locationScope === "personal") return "Personal Library";
  if (ctx?.locationScope === "shared" || ctx?.locationScope === "team") return "Shared Library";
  if (ctx?.locationScope === "enterprise") return "Shared Library";
  return "Unknown location";
}

function proxyProcessing(file: RecentFile): boolean {
  const st = file.proxyStatus;
  return st === "pending" || st === "processing" || st === "none";
}

export function buildDisplayMetadata(file: RecentFile, ctx?: DisplayContext): DisplayMetadata {
  const cat = classifyFileKind(file);
  const typeLabel = buildTypeLabel(file);
  const sizeSortValue = file.size;
  const sizeLabel =
    file.size === 0 && !file.id.startsWith("macos-pkg:") ? "Empty file" : formatBytes(file.size);

  const ts = bestFileTimestampMs(file);
  let modifiedLabel: string;
  let modifiedSortValue: number;
  let modifiedCompleteness: MetadataCompleteness;
  let modifiedTooltip: string | undefined;
  if (ts.ms != null && ts.iso) {
    modifiedLabel = formatLocaleDate(ts.iso);
    modifiedSortValue = ts.ms;
    modifiedCompleteness = ts.source === "modified" ? "full" : "derived";
    modifiedTooltip = new Date(ts.iso).toISOString();
  } else {
    modifiedLabel = "Recently uploaded";
    modifiedSortValue = 0;
    modifiedCompleteness = "fallback";
  }

  const locationLabel = resolveLocationLabel(file, ctx);
  const locationCompleteness: MetadataCompleteness = file.driveName?.trim() ? "full" : "fallback";

  const visualApplicable = cat === "video" || cat === "photo";
  const timedApplicable = cat === "video" || cat === "audio";
  const codecApplicable = cat === "video" || cat === "audio";

  const rw = file.resolution_w ?? file.width;
  const rh = file.resolution_h ?? file.height;
  let resolutionLabel: string;
  let resolutionCompleteness: MetadataCompleteness;
  let resolutionTooltip: string | undefined;
  let resolutionApplicable: FieldApplicability;

  if (visualApplicable) {
    resolutionApplicable = "applicable";
    if (rw != null && rh != null && rw > 0 && rh > 0) {
      resolutionLabel = `${rw}×${rh}`;
      resolutionCompleteness = "full";
      resolutionTooltip = `${rw}×${rh}`;
    } else {
      resolutionLabel = "Not scanned yet";
      resolutionCompleteness = "fallback";
    }
  } else {
    resolutionApplicable = "not_applicable";
    resolutionLabel = "Not applicable";
    resolutionCompleteness = "full";
  }

  let durationLabel: string;
  let durationSortValue: number;
  let durationCompleteness: MetadataCompleteness;
  let durationTooltip: string | undefined;
  let durationApplicable: FieldApplicability;

  if (timedApplicable) {
    durationApplicable = "applicable";
    const d0 = file.duration_sec;
    const d1 = file.proxyDurationSec;
    if (d0 != null && d0 > 0) {
      durationLabel = formatDurationClock(d0);
      durationSortValue = d0;
      durationCompleteness = "full";
      durationTooltip = `${d0.toFixed(2)}s`;
    } else if (d1 != null && d1 > 0) {
      durationLabel = formatDurationClock(d1);
      durationSortValue = d1;
      durationCompleteness = "derived";
      durationTooltip = `Proxy · ${d1.toFixed(2)}s`;
    } else if (proxyProcessing(file) && cat === "video") {
      durationLabel = "Processing";
      durationSortValue = 0;
      durationCompleteness = "fallback";
    } else {
      durationLabel = "Processing";
      durationSortValue = 0;
      durationCompleteness = "fallback";
    }
  } else {
    durationApplicable = "not_applicable";
    durationLabel = "No duration";
    durationSortValue = SORT_DURATION_NONE;
    durationCompleteness = "full";
  }

  let codecLabel: string;
  let codecCompleteness: MetadataCompleteness;
  let codecTooltip: string | undefined;
  let codecApplicable2: FieldApplicability;

  if (codecApplicable) {
    codecApplicable2 = "applicable";
    const vc = file.video_codec?.trim();
    if (vc) {
      codecLabel = vc;
      codecCompleteness = "full";
      codecTooltip = vc;
    } else {
      codecLabel = "Unscanned";
      codecCompleteness = "fallback";
    }
  } else if (cat === "project" && file.creativeDisplayLabel?.trim()) {
    codecApplicable2 = "not_applicable";
    codecLabel = file.creativeDisplayLabel.trim();
    codecCompleteness = "derived";
  } else {
    codecApplicable2 = "not_applicable";
    codecLabel = "Not applicable";
    codecCompleteness = "full";
  }

  return {
    name: file.name,
    typeLabel,
    sizeLabel,
    modifiedLabel,
    locationLabel,
    resolutionLabel,
    durationLabel,
    codecLabel,
    sizeSortValue,
    modifiedSortValue,
    durationSortValue,
    applicability: {
      resolution: resolutionApplicable,
      duration: durationApplicable,
      codec: codecApplicable2,
    },
    completeness: {
      modified: modifiedCompleteness,
      resolution: resolutionCompleteness,
      duration: durationCompleteness,
      codec: codecCompleteness,
      location: locationCompleteness,
    },
    tooltips: {
      modified: modifiedTooltip,
      resolution: resolutionTooltip,
      duration: durationTooltip,
      codec: codecTooltip,
      location: file.driveName?.trim() ? file.driveName : undefined,
    },
  };
}

/** Files under a virtual path prefix (storage tree or gallery media). */
export function filterFilesForVirtualFolder(
  files: RecentFile[],
  pathPrefix: string,
  opts: { isGalleryMediaDrive: boolean; currentDrivePath: string }
): RecentFile[] {
  if (opts.currentDrivePath) {
    return files.filter((f) => f.path === pathPrefix || f.path.startsWith(`${pathPrefix}/`));
  }
  return files.filter((f) => {
    const parts = f.path.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    if (opts.isGalleryMediaDrive) {
      const top = f.galleryId ?? parts[0];
      return top === pathPrefix;
    }
    return parts[0] === pathPrefix;
  });
}

export interface FolderDisplayInput {
  item: FolderItem;
  coverage: FolderRollupCoverage;
  /** Files inside this folder's scope (path prefix or gallery id match). Empty ok. */
  descendants: RecentFile[];
  context?: DisplayContext;
  /** Drive display name for location when browsing inside a drive */
  currentDriveName?: string | null;
}

function rollupKind(file: RecentFile): "video" | "photo" | "audio" | "document" | "other" {
  const c = classifyFileKind(file);
  if (c === "video") return "video";
  if (c === "photo") return "photo";
  if (c === "audio") return "audio";
  if (c === "document") return "document";
  return "other";
}

function folderResolutionSummary(counts: {
  video: number;
  photo: number;
  audio: number;
  doc: number;
  other: number;
}): string {
  const { video, photo, audio, doc, other } = counts;
  const total = video + photo + audio + doc + other;
  if (total === 0) return "Empty folder";
  const parts: string[] = [];
  if (photo) parts.push(`${photo} photo${photo === 1 ? "" : "s"}`);
  if (video) parts.push(`${video} video${video === 1 ? "" : "s"}`);
  if (audio) parts.push(`${audio} audio${audio === 1 ? "" : "s"}`);
  if (doc) parts.push(`${doc} document${doc === 1 ? "" : "s"}`);
  if (other && !photo && !video) parts.push(`${other} item${other === 1 ? "" : "s"}`);
  if (parts.length === 0) return "Mixed media";
  if (photo > 0 && video === 0 && audio === 0 && doc === 0 && other === 0) return "Photo library";
  if (video > 0 && photo === 0 && audio === 0 && doc === 0 && other === 0) return "Video library";
  if (parts.length === 1) return parts[0]!;
  return parts.join(", ");
}

function dominantCodec(files: RecentFile[], coverage: FolderRollupCoverage): string {
  const videoOnly = files.filter((f) => classifyFileKind(f) === "video");
  if (coverage === "partial" && videoOnly.length > 0) return "Partial details";
  const withCodec = videoOnly.map((f) => f.video_codec?.trim()).filter(Boolean) as string[];
  if (withCodec.length === 0) return "";
  const tally = new Map<string, number>();
  for (const c of withCodec) {
    const k = c.toLowerCase();
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [k, n] of tally) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  if (bestN / withCodec.length >= 0.8) return withCodec.find((c) => c.toLowerCase() === best)!;
  return "Mixed codecs";
}

export function buildFolderDisplayMetadata(input: FolderDisplayInput): DisplayMetadata {
  const { item, coverage, descendants, context, currentDriveName } = input;
  const n = item.items;
  const typeLabel = "Folder";

  let sizeLabel: string;
  let sizeSortValue: number;

  if (n === 0) {
    sizeLabel = "Empty folder";
    sizeSortValue = 0;
  } else if (coverage === "none") {
    sizeLabel = `${n} ${n === 1 ? "item" : "items"}`;
    sizeSortValue = n * 1_000_000_000;
  } else {
    const totalBytes = descendants.reduce((s, f) => s + (f.size ?? 0), 0);
    const base = `${n} ${n === 1 ? "item" : "items"}`;
    if (coverage === "partial") {
      sizeLabel = `${base} · Partial details`;
      sizeSortValue = totalBytes + n * 1000;
    } else {
      sizeLabel =
        totalBytes > 0 ? `${base} · ${formatBytes(totalBytes)}` : base;
      sizeSortValue = totalBytes + n * 1000;
    }
  }

  let locationLabel =
    context?.workspaceLabel?.trim() ||
    currentDriveName?.trim() ||
    resolveContextLocationFallback(context);

  if (!locationLabel) locationLabel = resolveContextLocationFallback(context);

  let modifiedSortValue = 0;
  let modifiedLabel: string;
  let modifiedTooltip: string | undefined;

  if (n === 0) {
    modifiedLabel = "Empty folder";
  } else if (coverage === "none") {
    modifiedLabel = "Open folder for details";
  } else {
    let maxMs = 0;
    let maxIso: string | null = null;
    for (const f of descendants) {
      const t = bestFileTimestampMs(f);
      if (t.ms != null && t.ms > maxMs) {
        maxMs = t.ms;
        maxIso = t.iso;
      }
    }
    if (maxMs > 0 && maxIso) {
      modifiedLabel = formatLocaleDate(maxIso);
      modifiedSortValue = maxMs;
      modifiedTooltip = new Date(maxIso).toISOString();
    } else {
      modifiedLabel = "Recently uploaded";
      modifiedSortValue = 0;
    }
  }

  const counts = { video: 0, photo: 0, audio: 0, doc: 0, other: 0 };
  for (const f of descendants) {
    const k = rollupKind(f);
    if (k === "video") counts.video++;
    else if (k === "photo") counts.photo++;
    else if (k === "audio") counts.audio++;
    else if (k === "document") counts.doc++;
    else counts.other++;
  }

  let resolutionLabel: string;
  let durationLabel: string;
  let codecLabel: string;
  let durationSortValue: number;

  if (n === 0) {
    resolutionLabel = "Empty folder";
    durationLabel = "Empty folder";
    codecLabel = "Empty folder";
    durationSortValue = SORT_DURATION_NONE;
  } else if (coverage === "none") {
    resolutionLabel = "Open folder for details";
    durationLabel = "Open folder for details";
    codecLabel = "Open folder for details";
    durationSortValue = SORT_DURATION_NONE;
  } else {
    resolutionLabel = folderResolutionSummary(counts);
    const timed = descendants.filter((f) => {
      const k = classifyFileKind(f);
      return k === "video" || k === "audio";
    });
    const totalDur = timed.reduce((s, f) => {
      const d = f.duration_sec ?? f.proxyDurationSec ?? 0;
      return s + (d > 0 ? d : 0);
    }, 0);
    if (coverage === "partial") {
      durationLabel =
        timed.length > 0 ? "Partial details" : "No timed media";
      durationSortValue = totalDur > 0 ? totalDur : SORT_DURATION_NONE;
    } else if (timed.length === 0) {
      durationLabel = "No timed media";
      durationSortValue = SORT_DURATION_NONE;
    } else if (totalDur > 0) {
      durationLabel = formatDurationClock(totalDur);
      durationSortValue = totalDur;
    } else {
      durationLabel = "No timed media";
      durationSortValue = SORT_DURATION_NONE;
    }

    const dc = dominantCodec(descendants, coverage);
    if (dc === "Partial details") {
      codecLabel = "Partial details";
    } else if (dc === "") {
      codecLabel = counts.video === 0 ? "No timed media" : "Mixed codecs";
    } else {
      codecLabel = dc === "Mixed codecs" ? "Mixed codecs" : dc;
    }
  }

  const rollupTooltip =
    coverage === "partial"
      ? "Based on loaded descendants only (list may be truncated)."
      : coverage === "full" && descendants.length > 0
        ? "Based on all loaded files in this folder scope."
        : undefined;

  return {
    name: item.name,
    typeLabel,
    sizeLabel,
    modifiedLabel,
    locationLabel,
    resolutionLabel,
    durationLabel,
    codecLabel,
    sizeSortValue,
    modifiedSortValue,
    durationSortValue,
    applicability: {
      resolution: "applicable",
      duration: n > 0 && coverage !== "none" ? "applicable" : "not_applicable",
      codec: n > 0 && coverage !== "none" ? "applicable" : "not_applicable",
    },
    completeness: {
      modified: coverage === "none" ? "fallback" : "derived",
      resolution: coverage === "none" ? "fallback" : "derived",
      duration: coverage === "none" ? "fallback" : "derived",
      codec: coverage === "none" ? "fallback" : "derived",
      location: "derived",
    },
    tooltips: {
      modified: modifiedTooltip,
      location: rollupTooltip,
      resolution: rollupTooltip,
      duration: rollupTooltip,
      codec: rollupTooltip,
    },
  };
}
