"use client";

import { useRef, useCallback, type MutableRefObject } from "react";
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

type UppyUploadPanelExpandedProps<M extends Meta, B extends Body> = {
  uppy: Uppy<M, B>;
  uppyRef: MutableRefObject<Uppy<M, B> | null>;
  uppyDataTheme: "dark" | "light";
  dashboardHeight: number;
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
  dashboardHeight,
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
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
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
      <div className="flex flex-wrap items-center gap-2 px-1">
        <input
          ref={filesInputRef}
          type="file"
          multiple
          className="sr-only"
          aria-hidden
          onChange={onFilesChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="sr-only"
          aria-hidden
          onChange={onFilesChange}
          // Non-standard attribute; enables directory upload in Chromium/WebKit.
          // eslint-disable-next-line react/no-unknown-property -- webkit directory picker
          {...{ webkitdirectory: "" }}
        />
        <button
          type="button"
          onClick={() => filesInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--bizzi-upload-border-subtle)" }}
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          Add files
        </button>
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--bizzi-upload-border-subtle)" }}
        >
          <FolderOpen className="h-3.5 w-3.5" aria-hidden />
          Add folder
        </button>
      </div>

      <UppyGroupedQueueList
        uppy={uppy}
        bundlesOnly
        queueDestinationChip={queueDestinationChip}
      />

      <div
        className="min-h-[200px] shrink-0 overflow-hidden rounded-xl border border-[var(--bizzi-upload-border-subtle)]/40"
        style={{
          height: Math.min(
            420,
            Math.max(260, Math.ceil(looseFileIds.length / columnCount) * UPLOAD_GRID_VIRTUAL_ROW_STRIDE)
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

      <Dashboard
        uppy={uppy}
        theme={uppyDataTheme}
        proudlyDisplayPoweredByUppy={false}
        height={hasFiles ? dashboardHeight + 40 : dashboardHeight}
        showSelectedFiles={false}
        disableThumbnailGenerator
        note={dashboardNote}
        fileManagerSelectionType="both"
        className="bizzi-uppy-dashboard-stack bizzi-uppy-dashboard-premium [&_.uppy-Dashboard-inner]:border-0 [&_.uppy-Dashboard-inner]:bg-transparent [&_.uppy-Dashboard-inner]:shadow-none [&_.uppy-Dashboard-AddFiles]:my-0 [&_.uppy-Dashboard-AddFiles]:min-h-[152px]"
      />
    </div>
  );
}
