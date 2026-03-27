/**
 * Creative format classification — three handling models (package container, single project file,
 * project support / interchange). Not every format uses macOS package container logic.
 */
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";

export type CreativeHandlingModel =
  | "package_container"
  | "single_project_file"
  | "project_support_file"
  | "archive_container"
  | "normal_media_asset";

/** Normalized creative metadata stored on backup_files and returned from filter API. */
export type CreativeClassification = {
  handling_model: CreativeHandlingModel;
  /** Fine-grained id, e.g. premiere_prproj, fcp_xml */
  project_file_type: string | null;
  creative_app: string | null;
  creative_display_label: string | null;
};

type RegistryEntry = {
  handling_model: Exclude<CreativeHandlingModel, "normal_media_asset" | "package_container">;
  project_file_type: string;
  creative_app: string;
  creative_display_label: string;
};

/** Longest match first */
const EXTENSION_ENTRIES: { ext: string; entry: RegistryEntry }[] = [
  { ext: "fcpxml", entry: { handling_model: "single_project_file", project_file_type: "fcp_xml", creative_app: "final_cut_pro", creative_display_label: "Final Cut XML" } },
  { ext: "prproj", entry: { handling_model: "single_project_file", project_file_type: "premiere_prproj", creative_app: "premiere_pro", creative_display_label: "Premiere Pro project" } },
  { ext: "premiereproject", entry: { handling_model: "single_project_file", project_file_type: "premiere_legacy", creative_app: "premiere_pro", creative_display_label: "Premiere Pro project" } },
  { ext: "aep", entry: { handling_model: "single_project_file", project_file_type: "after_effects_aep", creative_app: "after_effects", creative_display_label: "After Effects project" } },
  { ext: "mogrt", entry: { handling_model: "single_project_file", project_file_type: "after_effects_mogrt", creative_app: "after_effects", creative_display_label: "Motion Graphic Template" } },
  { ext: "lrcat", entry: { handling_model: "single_project_file", project_file_type: "lightroom_lrcat", creative_app: "lightroom", creative_display_label: "Lightroom catalog" } },
  { ext: "lrdata", entry: { handling_model: "archive_container", project_file_type: "lightroom_sidecar", creative_app: "lightroom", creative_display_label: "Lightroom data" } },
  { ext: "drp", entry: { handling_model: "single_project_file", project_file_type: "resolve_drp", creative_app: "davinci_resolve", creative_display_label: "DaVinci Resolve export" } },
  { ext: "drt", entry: { handling_model: "single_project_file", project_file_type: "resolve_drt", creative_app: "davinci_resolve", creative_display_label: "DaVinci Resolve template" } },
  { ext: "dra", entry: { handling_model: "archive_container", project_file_type: "resolve_dra", creative_app: "davinci_resolve", creative_display_label: "DaVinci Resolve archive" } },
  { ext: "otio", entry: { handling_model: "project_support_file", project_file_type: "otio", creative_app: "interchange", creative_display_label: "OpenTimelineIO" } },
  { ext: "aaf", entry: { handling_model: "project_support_file", project_file_type: "aaf", creative_app: "interchange", creative_display_label: "AAF" } },
  { ext: "edl", entry: { handling_model: "project_support_file", project_file_type: "edl", creative_app: "interchange", creative_display_label: "EDL" } },
  { ext: "xml", entry: { handling_model: "project_support_file", project_file_type: "generic_xml", creative_app: "interchange", creative_display_label: "XML" } },
  /** Premiere / other numbered XML timelines — still interchange */
  { ext: "psd", entry: { handling_model: "single_project_file", project_file_type: "photoshop_psd", creative_app: "photoshop", creative_display_label: "Photoshop" } },
  { ext: "psb", entry: { handling_model: "single_project_file", project_file_type: "photoshop_psb", creative_app: "photoshop", creative_display_label: "Photoshop large doc" } },
  { ext: "ai", entry: { handling_model: "single_project_file", project_file_type: "illustrator_ai", creative_app: "illustrator", creative_display_label: "Illustrator" } },
  { ext: "fcpproject", entry: { handling_model: "single_project_file", project_file_type: "fcp_project", creative_app: "final_cut_pro", creative_display_label: "Final Cut project" } },
  /** Library contents, not package container */
  { ext: "fcpevent", entry: { handling_model: "project_support_file", project_file_type: "fcp_event", creative_app: "final_cut_pro", creative_display_label: "Final Cut event" } },
];

function fileInsideMacosPackageInterior(relativePath: string): boolean {
  const pkg = macosPackageFirestoreFieldsFromRelativePath(relativePath);
  if (!pkg.macos_package_root_relative_path || !pkg.macos_package_kind) return false;
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  const segments = safe.split("/").filter(Boolean);
  const rootParts = pkg.macos_package_root_relative_path.split("/").filter(Boolean);
  return segments.length > rootParts.length;
}

function lookupByFileName(fileName: string): RegistryEntry | null {
  const lower = fileName.toLowerCase();
  for (const { ext, entry } of EXTENSION_ENTRIES) {
    if (lower.endsWith(`.${ext}`)) return entry;
  }
  return null;
}

/**
 * Classify a backup relative path for metadata + Projects filtering.
 * Files inside .fcpbundle (etc.) stay normal_media_asset so they are not double-counted as standalone projects.
 */
export function classifyCreativeFileFromRelativePath(relativePath: string): CreativeClassification {
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  const baseName = safe.split("/").filter(Boolean).pop() ?? safe;
  if (fileInsideMacosPackageInterior(safe)) {
    return {
      handling_model: "normal_media_asset",
      project_file_type: null,
      creative_app: null,
      creative_display_label: null,
    };
  }

  const hit = lookupByFileName(baseName);
  if (!hit) {
    return {
      handling_model: "normal_media_asset",
      project_file_type: null,
      creative_app: null,
      creative_display_label: null,
    };
  }

  return {
    handling_model: hit.handling_model,
    project_file_type: hit.project_file_type,
    creative_app: hit.creative_app,
    creative_display_label: hit.creative_display_label,
  };
}

/** Firestore fields to spread on backup_files at upload time (subset is OK). */
export function creativeFirestoreFieldsFromRelativePath(
  relativePath: string
): Record<string, string | null> {
  const c = classifyCreativeFileFromRelativePath(relativePath);
  if (c.handling_model === "normal_media_asset") {
    return {
      handling_model: "normal_media_asset",
      creative_app: null,
      project_file_type: null,
      creative_display_label: null,
    };
  }
  return {
    handling_model: c.handling_model,
    creative_app: c.creative_app,
    project_file_type: c.project_file_type,
    creative_display_label: c.creative_display_label,
  };
}

export function shouldSkipVideoProbeForCreativePath(relativePath: string): boolean {
  const c = classifyCreativeFileFromRelativePath(relativePath);
  return c.handling_model !== "normal_media_asset";
}

/** Filter API / Projects: interchange + NLE single project files (not package interiors). */
export function isCreativeProjectFilterMatch(item: Record<string, unknown>): boolean {
  const hm = String(item.handling_model ?? "").toLowerCase();
  if (hm === "single_project_file" || hm === "project_support_file") return true;
  if (hm === "archive_container" && item.project_file_type) return true;
  const at = String(item.asset_type ?? "").toLowerCase();
  if (at === "project_file" && item.project_file_type) return true;
  return false;
}
