/**
 * Resolver for branded “creative project” tiles (NLE + related app identity).
 *
 * Invariant: never show branded project tiles for paths strictly inside a macOS package
 * interior — only the package root row (or flat creative files outside packages).
 */
import type { RecentFile } from "@/hooks/useCloudFiles";
import {
  classifyCreativeFileFromRelativePath,
  isMacosPackageInteriorPath,
  type CreativeClassification,
} from "@/lib/creative-file-registry";
import { getMacosPackageKindFromFileName } from "@/lib/macos-package-bundles";

export type CreativeProjectTileVariant = "default" | "archive_container";

export type CreativeTileBrandId =
  | "premiere_pro"
  | "final_cut_pro"
  | "davinci_resolve"
  | "after_effects"
  | "lightroom"
  | "photoshop"
  | "illustrator"
  | "interchange"
  | "creative_generic";

export type ResolvedCreativeProjectTile =
  | { mode: "generic" }
  | {
      mode: "branded_project";
      brandId: CreativeTileBrandId;
      tileVariant: CreativeProjectTileVariant;
      displayLabel: string;
      extensionLabel: string;
    };

export type CreativeProjectThumbnailSource = {
  name: string;
  path?: string | null;
  assetType?: string | null;
  id?: string | null;
  creativeApp?: string | null;
  creativeDisplayLabel?: string | null;
  handlingModel?: string | null;
  projectFileType?: string | null;
  macosPackageKind?: string | null;
};

const KNOWN_APPS = new Set<string>([
  "premiere_pro",
  "final_cut_pro",
  "davinci_resolve",
  "after_effects",
  "lightroom",
  "photoshop",
  "illustrator",
  "interchange",
]);

function fileExtensionLabel(fileName: string): string {
  const m = /\.([^.]+)$/i.exec(fileName);
  return m ? `.${m[1].toLowerCase()}` : "";
}

function isMacosPackageRootRow(source: CreativeProjectThumbnailSource): boolean {
  return (
    source.assetType === "macos_package" || (source.id?.startsWith("macos-pkg:") ?? false)
  );
}

function resolveDavinciTileVariant(
  handlingModel?: string | null,
  projectFileType?: string | null
): CreativeProjectTileVariant {
  const hm = (handlingModel ?? "").toLowerCase();
  const pft = (projectFileType ?? "").toLowerCase();
  if (hm === "archive_container" && pft === "resolve_dra") return "archive_container";
  if (pft === "resolve_dra") return "archive_container";
  return "default";
}

function creativeAppToBrandId(app: string): CreativeTileBrandId {
  if (KNOWN_APPS.has(app)) return app as CreativeTileBrandId;
  return "creative_generic";
}

function defaultLabelForBrand(brandId: CreativeTileBrandId, rawApp: string): string {
  switch (brandId) {
    case "premiere_pro":
      return "Premiere Pro";
    case "final_cut_pro":
      return "Final Cut Pro";
    case "davinci_resolve":
      return "DaVinci Resolve";
    case "after_effects":
      return "After Effects";
    case "lightroom":
      return "Lightroom";
    case "photoshop":
      return "Photoshop";
    case "illustrator":
      return "Illustrator";
    case "interchange":
      return "Interchange";
    default:
      return rawApp.replace(/_/g, " ");
  }
}

function fromServerMetadata(
  source: CreativeProjectThumbnailSource,
  serverApp: string
): ResolvedCreativeProjectTile {
  const brandId = creativeAppToBrandId(serverApp);
  const displayLabel =
    source.creativeDisplayLabel?.trim() ||
    defaultLabelForBrand(brandId, serverApp);
  const ext = fileExtensionLabel(source.name);
  const tileVariant =
    serverApp === "davinci_resolve"
      ? resolveDavinciTileVariant(source.handlingModel, source.projectFileType)
      : "default";
  return {
    mode: "branded_project",
    brandId,
    tileVariant,
    displayLabel,
    extensionLabel: ext,
  };
}

function fromClassification(
  c: CreativeClassification,
  fileName: string
): ResolvedCreativeProjectTile {
  if (c.handling_model === "normal_media_asset" || !c.creative_app) {
    return { mode: "generic" };
  }
  const app = c.creative_app.toLowerCase();
  const brandId = creativeAppToBrandId(app);
  let tileVariant: CreativeProjectTileVariant = "default";
  if (c.creative_app === "davinci_resolve") {
    tileVariant = resolveDavinciTileVariant(c.handling_model, c.project_file_type);
  }
  return {
    mode: "branded_project",
    brandId,
    tileVariant,
    displayLabel:
      c.creative_display_label ?? defaultLabelForBrand(brandId, c.creative_app),
    extensionLabel: fileExtensionLabel(fileName),
  };
}

export function resolveCreativeProjectTile(
  source: CreativeProjectThumbnailSource
): ResolvedCreativeProjectTile {
  const safePath = (source.path ?? source.name).replace(/^\/+/, "").replace(/\.\./g, "");

  if (isMacosPackageInteriorPath(safePath)) {
    return { mode: "generic" };
  }

  if (isMacosPackageRootRow(source)) {
    const kind =
      source.macosPackageKind?.trim().toLowerCase() ||
      getMacosPackageKindFromFileName(source.name)?.toLowerCase() ||
      "";
    if (kind === "fcpbundle") {
      return {
        mode: "branded_project",
        brandId: "final_cut_pro",
        tileVariant: "default",
        displayLabel: "Final Cut Pro library",
        extensionLabel: ".fcpbundle",
      };
    }
    return { mode: "generic" };
  }

  const serverApp = source.creativeApp?.trim().toLowerCase();
  if (serverApp) {
    return fromServerMetadata(source, serverApp);
  }

  return fromClassification(classifyCreativeFileFromRelativePath(safePath), source.name);
}

/** Maps storage row fields for `resolveCreativeProjectTile`. */
export function recentFileToCreativeThumbnailSource(
  file: Pick<
    RecentFile,
    | "name"
    | "path"
    | "id"
    | "assetType"
    | "creativeApp"
    | "creativeDisplayLabel"
    | "handlingModel"
    | "projectFileType"
    | "macosPackageKind"
  >
): CreativeProjectThumbnailSource {
  return {
    name: file.name,
    path: file.path,
    id: file.id,
    assetType: file.assetType,
    creativeApp: file.creativeApp,
    creativeDisplayLabel: file.creativeDisplayLabel,
    handlingModel: file.handlingModel,
    projectFileType: file.projectFileType,
    macosPackageKind: file.macosPackageKind,
  };
}
