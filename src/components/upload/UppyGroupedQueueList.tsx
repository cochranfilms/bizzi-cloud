"use client";

import { useEffect, useMemo, useState } from "react";
import type { Uppy } from "@uppy/core";
import type { UppyFile, Meta, Body } from "@uppy/core";
import { Archive, FileIcon, X, RotateCcw } from "lucide-react";
import { packageKindDisplayLabel } from "@/lib/macos-package-bundles";
import { revokeUppyPreview } from "@/lib/uppy-local-preview";
import { resolveCreativeProjectTile } from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type PkgMeta = {
  macosPackageGroupRoot?: string;
  macosPackageKind?: string;
  relativePath?: string;
};

export function useUppyFileList<M extends Meta, B extends Body>(uppy: Uppy<M, B> | null): UppyFile<M, B>[] {
  const [, setV] = useState(0);
  useEffect(() => {
    if (!uppy) return;
    const bump = () => setV((x) => x + 1);
    uppy.on("state-update", bump);
    uppy.on("file-added", bump);
    uppy.on("file-removed", bump);
    uppy.on("upload-progress", bump);
    uppy.on("upload-success", bump);
    uppy.on("upload-error", bump);
    uppy.on("complete", bump);
    return () => {
      uppy.off("state-update", bump);
      uppy.off("file-added", bump);
      uppy.off("file-removed", bump);
      uppy.off("upload-progress", bump);
      uppy.off("upload-success", bump);
      uppy.off("upload-error", bump);
      uppy.off("complete", bump);
    };
  }, [uppy]);
  return uppy?.getFiles() ?? [];
}

function aggregateFileProgress<M extends Meta, B extends Body>(files: UppyFile<M, B>[]) {
  let bytesTotal = 0;
  let bytesUploaded = 0;
  let failed = 0;
  let complete = 0;
  for (const f of files) {
    const size = f.size ?? 0;
    bytesTotal += size;
    if (f.error) {
      failed++;
      continue;
    }
    const up = Number(f.progress?.bytesUploaded ?? 0);
    const done =
      f.progress?.uploadComplete === true || (size > 0 && up >= size);
    if (done) {
      bytesUploaded += size;
      complete++;
    } else {
      bytesUploaded += up;
    }
  }
  if (bytesTotal > 0 && bytesUploaded > bytesTotal) bytesUploaded = bytesTotal;
  const pct = bytesTotal > 0 ? Math.min(100, (bytesUploaded / bytesTotal) * 100) : 0;
  const allDone = files.length > 0 && complete + failed === files.length;
  return { bytesTotal, bytesUploaded, failed, complete, pct, allDone };
}

function escapeSelectorId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/([\\:!#$%^&*()+=[\]{}|';",./<>?~`])/g, "\\$1");
}

/**
 * Hides native Uppy file rows for macOS package members (they are shown as one card in
 * UppyGroupedQueueList). Loose files still appear in the Dashboard file list.
 */
export function HiddenMacosPackageRowsStyle<M extends Meta, B extends Body>({
  uppy,
}: {
  uppy: Uppy<M, B> | null;
}) {
  const files = useUppyFileList(uppy);
  const rules = useMemo(() => {
    const hiddenIds = files
      .filter((f) => Boolean((f.meta as PkgMeta).macosPackageGroupRoot?.trim()))
      .map((f) => f.id);
    if (hiddenIds.length === 0) return "";
    return hiddenIds
      .map((id) => `#uppy_${escapeSelectorId(id)}`)
      .join(",\n");
  }, [files]);
  if (!rules) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `${rules}{display:none!important;}`,
      }}
    />
  );
}

export default function UppyGroupedQueueList<M extends Meta, B extends Body>({
  uppy,
  bundlesOnly = false,
  listClassName = "",
  queueDestinationChip = null,
}: {
  uppy: Uppy<M, B> | null;
  /** When true, only macOS package cards (loose files use the native Uppy list). */
  bundlesOnly?: boolean;
  listClassName?: string;
  /** e.g. "RAW" — shown per row for locked Creator RAW sessions */
  queueDestinationChip?: string | null;
}) {
  const files = useUppyFileList(uppy);

  const { bundleGroups, loose } = useMemo(() => {
    const groups = new Map<string, { root: string; kind: string; members: typeof files }>();
    const looseList: typeof files = [];
    for (const f of files) {
      const m = f.meta as PkgMeta;
      const root = m.macosPackageGroupRoot?.trim();
      if (root) {
        let g = groups.get(root);
        if (!g) {
          g = { root, kind: m.macosPackageKind ?? "", members: [] };
          groups.set(root, g);
        }
        g.members.push(f);
      } else {
        looseList.push(f);
      }
    }
    return { bundleGroups: [...groups.values()], loose: looseList };
  }, [files]);

  if (files.length === 0) return null;
  if (bundlesOnly && bundleGroups.length === 0) return null;

  const removeLoose = (id: string) => {
    if (!uppy) return;
    const f = uppy.getFile(id);
    revokeUppyPreview(f?.preview);
    uppy.removeFile(id);
  };

  const removeBundle = (members: typeof files) => {
    if (!uppy) return;
    for (const f of members) {
      revokeUppyPreview(f.preview);
      uppy.removeFile(f.id);
    }
  };

  const retryBundle = async (members: typeof files) => {
    if (!uppy) return;
    for (const f of members) {
      if (f.error) await uppy.retryUpload(f.id);
    }
  };

  const outerClass = bundlesOnly
    ? `space-y-2.5 px-1 pb-0.5 pt-2 ${listClassName}`.trim()
    : `max-h-[280px] space-y-3 overflow-y-auto px-3 pb-3 ${listClassName}`.trim();

  return (
    <div className={outerClass} aria-label={bundlesOnly ? "Package uploads" : "Upload queue"}>
      {bundleGroups.map((g) => {
        const label = packageKindDisplayLabel(g.kind);
        const displayName = g.root.split("/").filter(Boolean).pop() ?? g.root;
        const members = g.members;
        const { bytesTotal, pct, failed, complete, allDone } = aggregateFileProgress(members);
        const anyFailed = failed > 0;
        const bundleTile = resolveCreativeProjectTile({
          name: displayName,
          path: g.root,
          assetType: "macos_package",
          macosPackageKind: g.kind || null,
          id: "macos-pkg:uppy-bundle",
        });
        return (
          <div key={g.root} className="bizzi-uppy-queue-card overflow-hidden">
            <div className="flex gap-3 p-2.5">
              <div className="bizzi-uppy-queue-thumb-well relative h-20 w-28 shrink-0 overflow-hidden rounded-xl">
                {bundleTile.mode === "branded_project" ? (
                  <BrandedProjectTile
                    brandId={bundleTile.brandId}
                    tileVariant={bundleTile.tileVariant}
                    fileName={displayName}
                    displayLabel={bundleTile.displayLabel}
                    extensionLabel={bundleTile.extensionLabel}
                    size="lg"
                    className="absolute inset-0"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-amber-50 dark:bg-amber-950/40">
                    <Archive className="h-9 w-9 text-amber-800 dark:text-amber-400" aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="bizzi-uppy-queue-title truncate text-sm font-semibold" title={displayName}>
                        {displayName}
                      </p>
                      {queueDestinationChip ? (
                        <span
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--bizzi-uppy-primary) 18%, transparent)",
                            color: "var(--bizzi-uppy-primary)",
                          }}
                        >
                          {queueDestinationChip}
                        </span>
                      ) : null}
                    </div>
                    <p className="bizzi-uppy-queue-muted text-xs">
                      {formatBytes(bytesTotal)} · {members.length} file{members.length === 1 ? "" : "s"} · {label}
                    </p>
                    <p className="bizzi-uppy-queue-muted mt-0.5 text-xs opacity-80">
                      {anyFailed
                        ? `${failed} failed, ${complete} complete`
                        : allDone
                          ? "Upload complete"
                          : "Uploading…"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {anyFailed && (
                      <button
                        type="button"
                        onClick={() => void retryBundle(members)}
                        className="bizzi-uppy-queue-icon-btn p-1"
                        aria-label={`Retry failed uploads for ${displayName}`}
                        title="Retry failed"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeBundle(members)}
                      className="bizzi-uppy-queue-icon-btn p-1 hover:!text-red-600 dark:hover:!text-red-400"
                      aria-label={`Remove ${displayName} from queue`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="bizzi-upload-panel-progress-track mt-2 h-1 overflow-hidden rounded-full">
                  <div
                    className={`h-full transition-all ${
                      anyFailed ? "bg-amber-500 dark:bg-amber-600" : ""
                    }`}
                    style={
                      anyFailed
                        ? { width: `${pct}%` }
                        : {
                            width: `${pct}%`,
                            backgroundColor: "var(--bizzi-uppy-primary)",
                          }
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {!bundlesOnly
        ? loose.map((f) => {
            const size = f.size ?? 0;
            const up = Number(f.progress?.bytesUploaded ?? 0);
            const done =
              f.progress?.uploadComplete === true || (size > 0 && up >= size);
            const pct = size > 0 ? Math.min(100, done ? 100 : (up / size) * 100) : 0;
            const name = f.name ?? "File";
            const m = f.meta as PkgMeta;
            const rel = m.relativePath?.trim();
            const looseTile = resolveCreativeProjectTile({ name, path: rel || name });
            return (
              <div
                key={f.id}
                className="bizzi-uppy-queue-card flex items-center gap-2.5 px-2.5 py-2"
              >
                <div className="bizzi-uppy-queue-thumb-well relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                  {f.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Uppy blob/object URL
                    <img src={f.preview} alt="" className="h-full w-full object-cover" />
                  ) : looseTile.mode === "branded_project" ? (
                    <BrandedProjectTile
                      brandId={looseTile.brandId}
                      tileVariant={looseTile.tileVariant}
                      fileName={name}
                      displayLabel={looseTile.displayLabel}
                      extensionLabel={looseTile.extensionLabel}
                      size="sm"
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="bizzi-uppy-queue-muted flex h-full w-full items-center justify-center">
                      <FileIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="bizzi-uppy-queue-title truncate text-xs font-semibold">{name}</p>
                    {queueDestinationChip ? (
                      <span
                        className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--bizzi-uppy-primary) 18%, transparent)",
                          color: "var(--bizzi-uppy-primary)",
                        }}
                      >
                        {queueDestinationChip}
                      </span>
                    ) : null}
                  </div>
                  <div className="bizzi-upload-panel-progress-track mt-1 h-0.5 overflow-hidden rounded-full">
                    <div
                      className={`h-full ${f.error ? "bg-red-500" : ""}`}
                      style={
                        f.error
                          ? { width: "100%" }
                          : {
                              width: `${pct}%`,
                              backgroundColor: "var(--bizzi-uppy-primary)",
                            }
                      }
                    />
                  </div>
                </div>
                {f.error && (
                  <button
                    type="button"
                    onClick={() => void uppy?.retryUpload(f.id)}
                    className="bizzi-uppy-queue-icon-btn shrink-0 p-1"
                    aria-label={`Retry ${name}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeLoose(f.id)}
                  className="bizzi-uppy-queue-icon-btn shrink-0 p-1 hover:!text-red-600 dark:hover:!text-red-400"
                  aria-label={`Remove ${name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        : null}
    </div>
  );
}
