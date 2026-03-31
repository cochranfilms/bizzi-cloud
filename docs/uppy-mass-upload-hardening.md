# Uppy mass-upload hardening

This document summarizes the client-side upload panel behavior for large batches (roughly 150–500 files, with a stronger “extreme” path beyond that). It is intended for developers and QA.

## Primary ingest path

- Files are added via **`runChunkedIngest`**: `uppy.addFiles` runs on slices whose size depends on **batch tier** (`getIngestChunkSize`).
- Between slices, the main thread is yielded via **`yieldToMain`** (`requestIdleCallback` → `requestAnimationFrame` → `setTimeout(0)`).
- **Dashboard `addFiles`** is patched as a guarded fallback so stock browse/drop paths still route through the same chunked pipeline when possible.

## Tiers and constants

| Tier     | Min file count | Notes |
| -------- | -------------- | ----- |
| normal   | `< 50`         | Default previews and throttles. |
| large    | `≥ 50`         | Idle previews, stronger throttles, banner. |
| extreme  | `≥ 200`        | No image previews in the grid (icon-only), smallest chunks, strongest throttles. |

Source: `src/lib/uppy-mass-upload-constants.ts` (`LARGE_BATCH_MIN`, `EXTREME_BATCH_MIN`).

Session tier is the **maximum** tier seen in the modal (`maxBatchTier`), so a huge drop keeps the grid in “heavy” mode for the rest of the session.

## UI channels

- **Structure**: `useUploadGridStructure` refreshes **loose file ids** (non–macOS-package members) on add/remove/complete/upload outcomes.
- **Progress**: the same hook **throttles** `upload-progress` into a `progressEpoch` so virtualized cells can re-read `uppy.getFile(id)` without reacting to every byte event. `upload-error` and `complete` **flush** immediately.

## Virtualized grid

- **Fixed-height** cards (`UPLOAD_GRID_CARD_ROW_HEIGHT`), **3-column** layout on wide viewports (`useUploadPanelColumnCount`).
- Implemented with `react-window` `FixedSizeGrid` in `VirtualizedUploadFileGrid.tsx`.

## Previews and cleanup

- **attachUppyLocalPreview** uses **eager** / **idle** / **skip** modes from tier (`file-added` in `UppyUploadModal.tsx`).
- On close and Uppy teardown, **`revokeAllUppyPreviewsFromUppy`** revokes blob URLs; removing a file still revokes that file’s preview.

## Aggregate and gallery progress

- Header aggregate progress uses **`getAggregateProgressThrottleMs`** (scheduled + immediate flush on errors).
- Gallery manage-grid **`upload_progress`** events are **min-interval** throttled per file with **`getGalleryProgressMinIntervalMs`**.

## Debug logging

- In development, or when `localStorage` contains `bizzi:uppyDebug=1`, **`createMassUploadDebug`** logs ingest milestones and warns if progress handlers exceed a rough Hz threshold.

## Automated tests

- `src/lib/uppy-mass-upload.test.ts`: tier thresholds, throttle ordering, `yieldToMain` fallbacks, `runChunkedIngest` chunking and abort.

## Manual QA checklist

1. **~50 files (large tier)**  
   - Panel stays responsive while adding.  
   - Banner mentions large batch; previews may appear after idle.  
   - Grid scrolls smoothly; progress updates are not hyper-frequent.

2. **~150 files**  
   - Same as above; confirm no long main-thread freeze during add.

3. **~300+ files (extreme tier)**  
   - Grid shows **icon-only** thumbs (no photos).  
   - Ingest progress line (“Adding files…”) matches completion.

4. **Interactivity**  
   - During add, header/panel can still collapse; close **aborts** ingest and clears previews (no blob leaks in DevTools → Memory).

5. **Entry paths**  
   - **Add files** / **Add folder** (custom buttons).  
   - **Dashboard** drop zone (chunked path).  
   - **`pendingFiles`** from host (e.g. programmatic open with files).

6. **macOS libraries**  
   - Folder structure preserved for `.fcpbundle` / similar via relative paths; note in Dashboard still visible.

## Related files

- `src/lib/uppy-chunked-ingest.ts`, `src/lib/uppy-local-preview.ts`, `src/lib/uppy-mass-upload-debug.ts`  
- `src/hooks/useUploadGridStructure.ts`, `src/hooks/useUploadPanelColumnCount.ts`  
- `src/components/upload/UppyUploadModal.tsx`, `UppyUploadPanelExpanded.tsx`, `VirtualizedUploadFileGrid.tsx`, `UppyGroupedQueueList.tsx`
