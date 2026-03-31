"use client";

import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { FixedSizeGrid as Grid, type GridChildComponentProps } from "react-window";
import type Uppy from "@uppy/core";
import type { Meta, Body } from "@uppy/core";
import { FileIcon, RotateCcw, X } from "lucide-react";
import type { BatchTier } from "@/lib/uppy-mass-upload-constants";
import {
  UPLOAD_GRID_CARD_ROW_HEIGHT,
  UPLOAD_GRID_GAP,
  UPLOAD_GRID_OVERSCAN_COL,
  UPLOAD_GRID_OVERSCAN_ROW,
  UPLOAD_GRID_VIRTUAL_ROW_STRIDE,
} from "@/lib/uppy-mass-upload-constants";
import { resolveCreativeProjectTile } from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";

export type VirtualizedUploadFileGridProps<M extends Meta, B extends Body> = {
  uppyRef: MutableRefObject<Uppy<M, B> | null>;
  looseFileIds: string[];
  columnCount: number;
  progressEpoch: number;
  batchTier: BatchTier;
  queueDestinationChip: string | null;
};

type CellData<M extends Meta, B extends Body> = VirtualizedUploadFileGridProps<M, B>;

function clampErr(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

const UploadFileCardInner = memo(function UploadFileCardInner({
  fileId,
  uppyRef,
  progressEpoch: _progressEpoch,
  batchTier,
  queueDestinationChip,
  cardWidth,
}: {
  fileId: string;
  uppyRef: MutableRefObject<Uppy | null>;
  progressEpoch: number;
  batchTier: BatchTier;
  queueDestinationChip: string | null;
  cardWidth: number;
}) {
  void _progressEpoch;
  const uppy = uppyRef.current;
  const file = uppy?.getFile(fileId);
  if (!file || !uppy) return null;

  const size = file.size ?? 0;
  const up = Number(file.progress?.bytesUploaded ?? 0);
  const done = file.progress?.uploadComplete === true || (size > 0 && up >= size);
  const pct = size > 0 ? Math.min(100, done ? 100 : (up / size) * 100) : 0;
  const name = file.name ?? "File";
  const rel = (file.meta as { relativePath?: string })?.relativePath?.trim();
  const looseTile = resolveCreativeProjectTile({ name, path: rel || name });
  const extreme = batchTier === "extreme";

  const remove = () => {
    const f = uppy.getFile(fileId);
    if (f?.preview?.startsWith("blob:")) URL.revokeObjectURL(f.preview);
    uppy.removeFile(fileId);
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--bizzi-upload-border-subtle)] bg-[color-mix(in_srgb,var(--bizzi-upload-workspace-bg)_94%,transparent)] px-2 pt-2"
      style={{ width: cardWidth, maxWidth: cardWidth, maxHeight: UPLOAD_GRID_CARD_ROW_HEIGHT }}
    >
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="bizzi-uppy-queue-thumb-well relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
          {extreme ? (
            <div className="flex h-full w-full items-center justify-center">
              <FileIcon className="h-5 w-5 opacity-70" aria-hidden />
            </div>
          ) : file.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL from Uppy
            <img src={file.preview} alt="" className="h-full w-full object-cover" />
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
          <div className="flex min-w-0 items-start gap-1">
            <p
              className="bizzi-uppy-queue-title line-clamp-2 min-w-0 flex-1 text-[11px] font-semibold leading-tight"
              title={name}
            >
              {name}
            </p>
            {queueDestinationChip ? (
              <span
                className="line-clamp-1 max-w-[4rem] shrink-0 rounded px-1 py-px text-[8px] font-semibold uppercase leading-none"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--bizzi-uppy-primary) 18%, transparent)",
                  color: "var(--bizzi-uppy-primary)",
                }}
                title={queueDestinationChip}
              >
                {queueDestinationChip}
              </span>
            ) : null}
          </div>
          <p className="line-clamp-1 text-[10px] text-opacity-80 opacity-80">
            {file.error ? (
              <span className="text-red-600 dark:text-red-400" title={file.error}>
                {clampErr(file.error, 42)}
              </span>
            ) : done ? (
              "Complete"
            ) : up > 0 ? (
              `Uploading ${Math.round(pct)}%`
            ) : (
              "Queued"
            )}
          </p>
        </div>
      </div>
      <div className="bizzi-upload-panel-progress-track mt-1.5 h-0.5 shrink-0 overflow-hidden rounded-full">
        <div
          className={`h-full ${file.error ? "bg-red-500" : ""}`}
          style={
            file.error
              ? { width: "100%" }
              : {
                  width: `${pct}%`,
                  backgroundColor: "var(--bizzi-uppy-primary)",
                }
          }
        />
      </div>
      <div className="mt-1.5 flex h-7 shrink-0 items-center justify-end gap-0.5 border-t border-transparent pt-1">
        {file.error ? (
          <button
            type="button"
            onClick={() => void uppy.retryUpload(fileId)}
            className="bizzi-uppy-queue-icon-btn rounded p-1"
            aria-label={`Retry ${name}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={remove}
          className="bizzi-uppy-queue-icon-btn rounded p-1 hover:!text-red-600 dark:hover:!text-red-400"
          aria-label={`Remove ${name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

function Cell<M extends Meta, B extends Body>({
  columnIndex,
  rowIndex,
  style,
  data,
}: GridChildComponentProps<CellData<M, B>>) {
  const { looseFileIds, uppyRef, columnCount, progressEpoch, batchTier, queueDestinationChip } = data;
  const idx = rowIndex * columnCount + columnIndex;
  const count = looseFileIds.length;
  const rowCount = Math.ceil(count / columnCount) || 1;
  const isLastRow = rowIndex === rowCount - 1;
  const slotsInRow = isLastRow ? count - rowIndex * columnCount : columnCount;
  if (columnIndex >= slotsInRow || idx >= count) {
    return <div style={style as CSSProperties} className="box-border" />;
  }

  const fileId = looseFileIds[idx];
  const innerWidth = Math.max(0, Number(style.width) - UPLOAD_GRID_GAP);

  return (
    <div
      style={
        {
          ...style,
          paddingRight: columnIndex < columnCount - 1 ? UPLOAD_GRID_GAP : 0,
          paddingBottom: UPLOAD_GRID_GAP,
          boxSizing: "border-box",
        } as CSSProperties
      }
      className="box-border"
    >
      <UploadFileCardInner
        fileId={fileId}
        uppyRef={uppyRef as unknown as MutableRefObject<Uppy | null>}
        progressEpoch={progressEpoch}
        batchTier={batchTier}
        queueDestinationChip={queueDestinationChip}
        cardWidth={innerWidth}
      />
    </div>
  );
}

export default function VirtualizedUploadFileGrid<M extends Meta, B extends Body>({
  uppyRef,
  looseFileIds,
  columnCount,
  progressEpoch,
  batchTier,
  queueDestinationChip,
}: VirtualizedUploadFileGridProps<M, B>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 640, height: 320 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const read = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth > 0 && clientHeight > 0) {
        setDims({ width: clientWidth, height: clientHeight });
      }
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = looseFileIds.length;
  const rowCount = count === 0 ? 0 : Math.ceil(count / columnCount);
  const columnWidth = columnCount > 0 ? dims.width / columnCount : dims.width;
  const rowHeight = UPLOAD_GRID_VIRTUAL_ROW_STRIDE;

  const itemData = useMemo(
    () =>
      ({
        uppyRef,
        looseFileIds,
        columnCount,
        progressEpoch,
        batchTier,
        queueDestinationChip,
      }) as CellData<M, B>,
    [
      uppyRef,
      looseFileIds,
      columnCount,
      progressEpoch,
      batchTier,
      queueDestinationChip,
    ]
  );

  const cell = useCallback((props: GridChildComponentProps<CellData<M, B>>) => <Cell {...props} />, []);

  if (count === 0) return null;

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[200px] flex-1"
      role="grid"
      aria-label="Files to upload"
      aria-rowcount={rowCount}
      aria-colcount={columnCount}
    >
      <Grid
        columnCount={columnCount}
        columnWidth={columnWidth}
        height={dims.height}
        rowCount={rowCount}
        rowHeight={rowHeight}
        width={dims.width}
        overscanColumnCount={UPLOAD_GRID_OVERSCAN_COL}
        overscanRowCount={UPLOAD_GRID_OVERSCAN_ROW}
        itemData={itemData}
      >
        {cell}
      </Grid>
    </div>
  );
}
