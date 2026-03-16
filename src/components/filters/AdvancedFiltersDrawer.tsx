"use client";

import { useMemo } from "react";
import Sheet from "@/components/ui/Sheet";
import FilterSection from "./FilterSection";
import FilterSearch from "./FilterSearch";
import DatePresetSelector from "./DatePresetSelector";
import FileSizeRange from "./FileSizeRange";
import FileTypeChips from "./FileTypeChips";
import WorkflowStatusChips from "./WorkflowStatusChips";
import FilterMultiSelect from "./FilterMultiSelect";
import FilterCheckbox from "./FilterCheckbox";
import { VIDEO_FILTERS, PHOTO_FILTERS } from "@/lib/filters/filter-config";
import type { FilterState } from "@/lib/filters/apply-filters";

interface AdvancedFiltersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterState: FilterState;
  setFilter: (id: string, value: string | string[] | boolean | undefined) => void;
  onReset?: () => void;
  drives?: { id: string; name: string }[];
  galleries?: { id: string; title: string }[];
  insideFolder?: boolean;
}

const FILE_TYPE_OPTIONS = [
  { value: "video", label: "Video" },
  { value: "photo", label: "Photo" },
  { value: "raw", label: "RAW" },
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/heic", label: "HEIC" },
  { value: "image/tiff", label: "TIFF" },
  { value: "image/webp", label: "WEBP" },
  { value: "video/mp4", label: "MP4" },
  { value: "video/quicktime", label: "MOV" },
];

export default function AdvancedFiltersDrawer({
  open,
  onOpenChange,
  filterState,
  setFilter,
  onReset,
  drives = [],
  galleries = [],
  insideFolder = false,
}: AdvancedFiltersDrawerProps) {
  const driveOptions = useMemo(
    () => drives.map((d) => ({ value: d.id, label: d.name })),
    [drives]
  );
  const galleryOptions = useMemo(
    () => galleries.map((g) => ({ value: g.id, label: g.title })),
    [galleries]
  );

  const datePreset = filterState.date_preset as string | undefined;
  const dateFrom = filterState.date_from as string | undefined;
  const dateTo = filterState.date_to as string | undefined;
  const sizePreset = filterState.size_preset as string | undefined;
  const sizeMin = filterState.size_min;
  const sizeMax = filterState.size_max;
  const minBytes =
    typeof sizeMin === "string"
      ? parseInt(sizeMin, 10)
      : typeof sizeMin === "number"
        ? sizeMin
        : undefined;
  const maxBytes =
    typeof sizeMax === "string"
      ? parseInt(sizeMax, 10)
      : typeof sizeMax === "number"
        ? sizeMax
        : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" title="Advanced filters">
      <div className="p-5 space-y-1">
        <FilterSection title="General" defaultCollapsed={false}>
          <div className="space-y-5">
            <FilterSearch
              value={filterState.search as string | undefined}
              onChange={(v) => setFilter("search", v || undefined)}
              placeholder="Filename, tag, project…"
              label="Search"
            />
            <div>
              <span className="mb-2 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Date
              </span>
              <DatePresetSelector
                value={datePreset}
                customFrom={dateFrom}
                customTo={dateTo}
                onPresetChange={(v) => {
                  setFilter("date_preset", v || undefined);
                  if (v !== "custom") {
                    setFilter("date_from", undefined);
                    setFilter("date_to", undefined);
                  }
                }}
                onCustomChange={(from, to) => {
                  setFilter("date_preset", "custom");
                  setFilter("date_from", from || undefined);
                  setFilter("date_to", to || undefined);
                }}
              />
            </div>
            <div>
              <span className="mb-2 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                File size
              </span>
              <FileSizeRange
                preset={sizePreset}
                minBytes={!isNaN(minBytes ?? NaN) ? minBytes : undefined}
                maxBytes={!isNaN(maxBytes ?? NaN) ? maxBytes : undefined}
                onPresetChange={(v) => {
                  setFilter("size_preset", v || undefined);
                  if (v) {
                    setFilter("size_min", undefined);
                    setFilter("size_max", undefined);
                  }
                }}
                onRangeChange={(min, max) => {
                  setFilter("size_preset", undefined);
                  setFilter("size_min", min != null ? String(min) : undefined);
                  setFilter("size_max", max != null ? String(max) : undefined);
                }}
              />
            </div>
          </div>
        </FilterSection>

        <FilterSection title="File type" defaultCollapsed={false}>
          <FileTypeChips
            options={FILE_TYPE_OPTIONS}
            value={[
              ...(Array.isArray(filterState.media_type)
                ? filterState.media_type
                : filterState.media_type && typeof filterState.media_type === "string"
                  ? [filterState.media_type]
                  : []),
              ...(Array.isArray(filterState.file_type)
                ? (filterState.file_type as string[])
                : filterState.file_type && typeof filterState.file_type === "string"
                  ? [filterState.file_type]
                  : []),
            ].filter((x): x is string => typeof x === "string")}
            onChange={(v: string | string[]) => {
              const arr = (Array.isArray(v) ? v : v ? [v] : []).filter((x): x is string => typeof x === "string");
              const mediaTypes = arr.filter((x): x is string => typeof x === "string" && ["video", "photo"].includes(x));
              const fileTypes = arr.filter((x): x is string => typeof x === "string" && !["video", "photo"].includes(x));
              setFilter("media_type", mediaTypes.length <= 1 ? mediaTypes[0] : mediaTypes.length ? mediaTypes : undefined);
              setFilter("file_type", fileTypes.length <= 1 ? fileTypes[0] : fileTypes.length ? fileTypes : undefined);
            }}
          />
        </FilterSection>

        <FilterSection title="Media details" defaultCollapsed={true}>
          <div className="space-y-4">
            <FilterMultiSelect
              label="Resolution"
              options={
                [...(VIDEO_FILTERS.find((f) => f.id === "resolution")?.options ?? []), ...(PHOTO_FILTERS.find((f) => f.id === "photo_resolution")?.options ?? [])]
              }
              value={(filterState.resolution ?? filterState.photo_resolution) as string | string[] | undefined}
              onChange={(v) => setFilter("resolution", Array.isArray(v) ? v : v ? [v] : undefined)}
            />
            <FilterMultiSelect
              label="Orientation"
              options={PHOTO_FILTERS.find((f) => f.id === "orientation")?.options ?? []}
              value={filterState.orientation as string | string[] | undefined}
              onChange={(v) => setFilter("orientation", v)}
            />
            <FilterMultiSelect
              label="Duration"
              options={VIDEO_FILTERS.find((f) => f.id === "duration")?.options ?? []}
              value={filterState.duration as string | string[] | undefined}
              onChange={(v) => setFilter("duration", v)}
            />
            <FilterMultiSelect
              label="Codec"
              options={VIDEO_FILTERS.find((f) => f.id === "codec")?.options ?? []}
              value={filterState.codec as string | string[] | undefined}
              onChange={(v) => setFilter("codec", v)}
            />
            <FilterMultiSelect
              label="Frame rate"
              options={VIDEO_FILTERS.find((f) => f.id === "frame_rate")?.options ?? []}
              value={filterState.frame_rate as string | string[] | undefined}
              onChange={(v) => setFilter("frame_rate", v)}
            />
          </div>
        </FilterSection>

        <FilterSection title="Workflow" defaultCollapsed={true}>
          <WorkflowStatusChips
            value={filterState.usage_status as string | string[] | undefined}
            onChange={(v) => setFilter("usage_status", v)}
          />
        </FilterSection>

        <FilterSection title="Collaboration" defaultCollapsed={true}>
          <div className="space-y-4">
            <FilterCheckbox
              checked={filterState.shared === true || filterState.shared === "true"}
              onChange={(v) => setFilter("shared", v)}
              label="Shared with me"
            />
            <FilterCheckbox
              checked={filterState.starred === true || filterState.starred === "true"}
              onChange={(v) => setFilter("starred", v)}
              label="Hearted"
            />
            <FilterCheckbox
              checked={filterState.commented === true || filterState.commented === "true"}
              onChange={(v) => setFilter("commented", v)}
              label="Commented"
            />
            {driveOptions.length > 0 && !insideFolder && (
              <FilterMultiSelect
                label="Uploaded by / Folder"
                options={driveOptions}
                value={filterState.drive as string | string[] | undefined}
                onChange={(v) => setFilter("drive", v)}
              />
            )}
          </div>
        </FilterSection>

        <FilterSection title="Saved views" defaultCollapsed={true}>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Save views like “Recent Client Deliveries” or “RAW Selects” for quick access. Coming soon.
          </p>
        </FilterSection>

        <FilterSection title="Organization" defaultCollapsed={true}>
          <div className="space-y-4">
            {galleryOptions.length > 0 && (
              <FilterMultiSelect
                label="Gallery"
                options={galleryOptions}
                value={filterState.gallery as string | string[] | undefined}
                onChange={(v) => setFilter("gallery", v)}
              />
            )}
            <FilterSearch
              value={filterState.tags as string | undefined}
              onChange={(v) => setFilter("tags", v || undefined)}
              placeholder="Tags / keywords…"
              label="Tags"
            />
          </div>
        </FilterSection>

        <div className="sticky bottom-0 flex gap-2 border-t border-neutral-200 bg-white pt-4 dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => {
              onReset?.();
              onOpenChange(false);
            }}
            className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bizzi-blue/90 dark:bg-bizzi-cyan dark:hover:bg-bizzi-cyan/90"
          >
            Apply
          </button>
        </div>
      </div>
    </Sheet>
  );
}
