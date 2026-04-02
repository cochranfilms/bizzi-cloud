"use client";

import { useCallback, type MutableRefObject } from "react";
import Uppy from "@uppy/core";
import type { Meta, Body } from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import { FolderOpen, ImagePlus } from "lucide-react";
import type { BatchTier } from "@/lib/uppy-mass-upload-constants";
import { UPLOAD_GRID_VIRTUAL_ROW_STRIDE } from "@/lib/uppy-mass-upload-constants";
import { useUploadGridStructure } from "@/hooks/useUploadGridStructure";
import { useUploadPanelColumnCount } from "@/hooks/useUploadPanelColumnCount";
import UppyGroupedQueueList from "@/components/upload/UppyGroupedQueueList";
import VirtualizedUploadFileGrid from "@/components/upload/VirtualizedUploadFileGrid";

/** Viewport-tuned sizes for the file grid (updated on resize). */
export type UploadPanelMetrics = {
  fileGridMin: number;
  fileGridMax: number;
};

type UppyUploadPanelExpandedProps<M extends Meta, B extends Body> = {
  uppy: Uppy<M, B>;
  uppyRef: MutableRefObject<Uppy<M, B> | null>;
  uppyDataTheme: "dark" | "light";
  panelMetrics: UploadPanelMetrics;
  hasFiles: boolean;
  sessionGridTier: BatchTier;
  ingestPhase: "idle" | "queued" | "adding";
  ingestAdded: number;
  ingestTotal: number;
  batchUiHint: BatchTier | null;
  onAddFiles: (files: File[]) => void;
  queueDestinationChip: string | null;
  /** Dashboard `note` copy */
  dashboardNote: string;
};

export default function UppyUploadPanelExpanded<M extends Meta, B extends Body>({
  uppy,
  uppyRef,
  uppyDataTheme,
  panelMetrics,
  hasFiles,
  sessionGridTier,
  ingestPhase,
  ingestAdded,
  ingestTotal,
  batchUiHint,
  onAddFiles,
  queueDestinationChip,
  dashboardNote,
}: UppyUploadPanelExpandedProps<M, B>) {
  const columnCount = useUploadPanelColumnCount();
  const { looseFileIds, progressEpoch } = useUploadGridStructure(uppy, sessionGridTier);

  const onFilesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      e.target.value = "";
      if (!list?.length) return;
      onAddFiles(Array.from(list));
    },
    [onAddFiles]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {batchUiHint ? (
        <div
          className="mx-1 rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug"
          style={{
            borderColor: "var(--bizzi-upload-border-subtle)",
            backgroundColor: "color-mix(in srgb, var(--bizzi-uppy-primary) 8%, transparent)",
          }}
        >
          {batchUiHint === "extreme"
            ? "Large batch detected — optimizing upload view (minimal previews, throttled progress)."
            : "Large batch — using lighter previews and queued file handling."}
        </div>
      ) : null}
      {(ingestPhase === "queued" || ingestPhase === "adding") && ingestTotal > 0 ? (
        <p className="mx-1 text-[11px] text-[var(--bizzi-upload-text)] opacity-90">
          Adding files… {ingestAdded} / {ingestTotal}
        </p>
      ) : null}
      <div className="bizzi-uppy-add-files-toolbar flex flex-wrap items-center gap-2 px-1">
        {/*
          Native file/folder picking via invisible input over label (reliable across browsers).
          Programmatic input.click() from a separate button is often blocked; label + overlay input is not.
        */}
        <label className="bizzi-uppy-file-action-label relative inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium">
          <input
            type="file"
            multiple
            className="absolute inset-0 z-[1] cursor-pointer opacity-0"
            aria-label="Choose files to upload"
            onChange={onFilesChange}
          />
          <span className="pointer-events-none inline-flex items-center gap-1.5">
            <ImagePlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Add files
          </span>
        </label>
        <label className="bizzi-uppy-file-action-label relative inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium">
          <input
            type="file"
            multiple
            className="absolute inset-0 z-[1] cursor-pointer opacity-0"
            aria-label="Choose a folder to upload"
            onChange={onFilesChange}
            // Non-standard attribute; enables directory upload in Chromium/WebKit.
            // eslint-disable-next-line react/no-unknown-property -- webkit directory picker
            {...{ webkitdirectory: "" }}
          />
          <span className="pointer-events-none inline-flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Add folder
          </span>
        </label>
      </div>

      {dashboardNote ? (
        <p className="mx-1 text-[11px] leading-snug text-[var(--bizzi-upload-text-muted)] sm:text-xs">
          {dashboardNote}
        </p>
      ) : null}

      <UppyGroupedQueueList
        uppy={uppy}
        bundlesOnly
        queueDestinationChip={queueDestinationChip}
      />

      {looseFileIds.length > 0 ? (
        <div
          className="min-h-0 shrink-0 overflow-hidden rounded-xl border border-[var(--bizzi-upload-border-subtle)]/40 max-sm:rounded-lg"
          style={{
            height: Math.min(
              panelMetrics.fileGridMax,
              Math.max(
                panelMetrics.fileGridMin,
                Math.ceil(looseFileIds.length / columnCount) * UPLOAD_GRID_VIRTUAL_ROW_STRIDE
              )
            ),
          }}
        >
          <VirtualizedUploadFileGrid
            uppyRef={uppyRef}
            looseFileIds={looseFileIds}
            columnCount={columnCount}
            progressEpoch={progressEpoch}
            batchTier={sessionGridTier}
            queueDestinationChip={queueDestinationChip}
          />
        </div>
      ) : null}

      <Dashboard
        uppy={uppy}
        theme={uppyDataTheme}
        proudlyDisplayPoweredByUppy={false}
        height={hasFiles ? 120 : 56}
        showSelectedFiles={false}
        disableThumbnailGenerator
        note={null}
        fileManagerSelectionType="both"
        className="bizzi-uppy-dashboard-stack bizzi-uppy-dashboard-premium bizzi-uppy-dashboard-hide-inline-drop [&_.uppy-Dashboard-inner]:border-0 [&_.uppy-Dashboard-inner]:bg-transparent [&_.uppy-Dashboard-inner]:shadow-none [&_.uppy-Dashboard-AddFiles]:my-0"
      />
    </div>
  );
}
