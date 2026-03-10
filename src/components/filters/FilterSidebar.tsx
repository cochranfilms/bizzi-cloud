"use client";

import { useMemo } from "react";
import FilterSection from "./FilterSection";
import FilterMultiSelect from "./FilterMultiSelect";
import FilterSearch from "./FilterSearch";
import FilterCheckbox from "./FilterCheckbox";
import FilterDateRange from "./FilterDateRange";
import FilterSizeRange from "./FilterSizeRange";
import {
  getFiltersForMediaType,
  UNIVERSAL_FILTERS,
  VIDEO_FILTERS,
  PHOTO_FILTERS,
  type FilterDef,
} from "@/lib/filters/filter-config";
import type { FilterState } from "@/lib/filters/apply-filters";

interface FilterSidebarProps {
  filterState: FilterState;
  setFilter: (id: string, value: string | string[] | boolean | undefined) => void;
  drives?: { id: string; name: string }[];
  galleries?: { id: string; title: string }[];
  mediaType?: "video" | "photo";
}

export default function FilterSidebar({
  filterState,
  setFilter,
  drives = [],
  galleries = [],
  mediaType,
}: FilterSidebarProps) {
  const { universal, video, photo } = getFiltersForMediaType(mediaType);

  const driveOptions = useMemo(
    () => drives.map((d) => ({ value: d.id, label: d.name })),
    [drives]
  );
  const galleryOptions = useMemo(
    () => galleries.map((g) => ({ value: g.id, label: g.title })),
    [galleries]
  );

  const renderFilter = (def: FilterDef) => {
    const value = filterState[def.id];
    if (def.type === "date_range") {
      return (
        <FilterDateRange
          key={def.id}
          from={(filterState.date_from as string) || undefined}
          to={(filterState.date_to as string) || undefined}
          onFromChange={(v) => setFilter("date_from", v || undefined)}
          onToChange={(v) => setFilter("date_to", v || undefined)}
          label={def.label}
        />
      );
    }
    if (def.type === "range" && def.id === "file_size") {
      const min = filterState.size_min;
      const max = filterState.size_max;
      const minNum = typeof min === "string" ? parseInt(min, 10) : undefined;
      const maxNum = typeof max === "string" ? parseInt(max, 10) : undefined;
      return (
        <FilterSizeRange
          key={def.id}
          minBytes={!isNaN(minNum ?? NaN) ? minNum : undefined}
          maxBytes={!isNaN(maxNum ?? NaN) ? maxNum : undefined}
          onMinChange={(bytes) => setFilter("size_min", bytes != null ? String(bytes) : undefined)}
          onMaxChange={(bytes) => setFilter("size_max", bytes != null ? String(bytes) : undefined)}
          label={def.label}
          configMax={def.max}
        />
      );
    }
    if (def.type === "search") {
      if (def.id === "search" || def.id === "tags") {
        return (
          <FilterSearch
            key={def.id}
            value={typeof value === "string" ? value : undefined}
            onChange={(v) => setFilter(def.id, v || undefined)}
            placeholder={def.id === "tags" ? "Tags / keywords…" : "Filename, tag, project…"}
          />
        );
      }
      if (def.id === "camera_model" || def.id === "lens") {
        return (
          <FilterSearch
            key={def.id}
            value={typeof value === "string" ? value : undefined}
            onChange={(v) => setFilter(def.id, v || undefined)}
            placeholder={def.label}
          />
        );
      }
    }
    if (def.type === "checkbox") {
      return (
        <FilterCheckbox
          key={def.id}
          checked={value === true || value === "true"}
          onChange={(v) => setFilter(def.id, v)}
          label={def.label}
        />
      );
    }
    if (def.type === "multi_select") {
      const options =
        def.id === "drive"
          ? driveOptions
          : def.id === "gallery"
            ? galleryOptions
            : def.options ?? [];
      if (options.length === 0 && (def.id === "drive" || def.id === "gallery")) {
        return null;
      }
      return (
        <FilterMultiSelect
          key={def.id}
          options={options}
          value={value as string | string[] | undefined}
          onChange={(v) => setFilter(def.id, v)}
        />
      );
    }
    return null;
  };

  const hasUniversal = universal.length > 0;
  const hasVideo = video.length > 0;
  const hasPhoto = photo.length > 0;

  return (
    <div className="space-y-1">
      {hasUniversal && (
        <FilterSection title="Filters" defaultCollapsed={false}>
          <div className="space-y-4">
            {universal.map(renderFilter)}
          </div>
        </FilterSection>
      )}
      {hasVideo && (
        <FilterSection title="Video" defaultCollapsed={true}>
          <div className="space-y-4">{video.map(renderFilter)}</div>
        </FilterSection>
      )}
      {hasPhoto && (
        <FilterSection title="Photo" defaultCollapsed={true}>
          <div className="space-y-4">{photo.map(renderFilter)}</div>
        </FilterSection>
      )}
    </div>
  );
}
