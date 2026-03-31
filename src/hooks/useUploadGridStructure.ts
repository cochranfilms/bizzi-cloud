"use client";

import { useCallback, useEffect, useState } from "react";
import type Uppy from "@uppy/core";
import type { Meta, Body } from "@uppy/core";
import type { BatchTier } from "@/lib/uppy-mass-upload-constants";
import { getGridProgressThrottleMs } from "@/lib/uppy-mass-upload-constants";

type PkgMeta = { macosPackageGroupRoot?: string };

function looseIdsFromUppy<M extends Meta, B extends Body>(uppy: Uppy<M, B>): string[] {
  return uppy
    .getFiles()
    .filter((f) => !(f.meta as PkgMeta)?.macosPackageGroupRoot?.trim())
    .map((f) => f.id);
}

/**
 * Structure channel: loose file ids + revision when presence changes.
 * Progress channel: throttled epoch — visible grid cells may read `uppy.getFile(id)` when epoch bumps.
 */
export function useUploadGridStructure<M extends Meta, B extends Body>(
  uppy: Uppy<M, B> | null,
  batchTier: BatchTier
): {
  looseFileIds: string[];
  structureRevision: number;
  progressEpoch: number;
} {
  const [looseFileIds, setLooseFileIds] = useState<string[]>([]);
  const [structureRevision, setStructureRevision] = useState(0);
  const [progressEpoch, setProgressEpoch] = useState(0);

  const bumpStructure = useCallback(() => {
    if (!uppy) return;
    const ids = looseIdsFromUppy(uppy);
    setLooseFileIds(ids);
    setStructureRevision((r) => r + 1);
  }, [uppy]);

  useEffect(() => {
    if (!uppy) {
      setLooseFileIds([]);
      return;
    }
    bumpStructure();

    const onStructure = () => bumpStructure();
    uppy.on("file-added", onStructure);
    uppy.on("file-removed", onStructure);
    uppy.on("files-added", onStructure);
    uppy.on("upload-success", onStructure);
    uppy.on("upload-error", onStructure);
    uppy.on("complete", onStructure);

    const ms = getGridProgressThrottleMs(batchTier);
    let progressTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleProgress = () => {
      if (progressTimer != null) return;
      progressTimer = setTimeout(() => {
        progressTimer = null;
        setProgressEpoch((e) => e + 1);
      }, ms);
    };
    const flushProgress = () => {
      if (progressTimer != null) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
      setProgressEpoch((e) => e + 1);
    };

    uppy.on("upload-progress", scheduleProgress);
    uppy.on("upload-error", flushProgress);
    uppy.on("complete", flushProgress);

    return () => {
      uppy.off("file-added", onStructure);
      uppy.off("file-removed", onStructure);
      uppy.off("files-added", onStructure);
      uppy.off("upload-success", onStructure);
      uppy.off("upload-error", onStructure);
      uppy.off("complete", onStructure);
      uppy.off("upload-progress", scheduleProgress);
      uppy.off("upload-error", flushProgress);
      uppy.off("complete", flushProgress);
      if (progressTimer != null) clearTimeout(progressTimer);
    };
  }, [uppy, bumpStructure, batchTier]);

  return { looseFileIds, structureRevision, progressEpoch };
}
