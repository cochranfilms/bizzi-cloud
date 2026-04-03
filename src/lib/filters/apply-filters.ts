/**
 * Client-side filter helpers: URL parsing, filter state, chip labels.
 */

import { getFilterDef } from "./filter-config";
import {
  datePresetToRange,
  DATE_PRESETS,
  sizePresetToRange,
  SIZE_PRESETS,
} from "./filter-presets";

/** Filter state as key-value pairs (multi-values as comma-separated) */
export interface FilterState {
  [key: string]: string | string[] | boolean | undefined;
}

/** Single active filter for chip display */
export interface ActiveFilter {
  id: string;
  value: string | string[] | boolean;
  label: string;
}

/** Query params that should deserialize as booleans (chip + drawer parity with Firestore filters). */
const BOOLEAN_PARAM_KEYS = new Set([
  "starred",
  "shared",
  "commented",
  "creative_projects",
]);

/**
 * URL keys for file-browser navigation / deep-linking — not All-files filter chips or `/api/files/filter` params.
 * (Otherwise `folder=<Firestore id>` shows as a raw chip and forces the filter grid while browsing Storage v2.)
 */
/** Preserved when clearing “all filters”; also omitted from chips and `/api/files/filter` params. `drive` is intentionally not listed — it doubles as a real drive filter on All files landing. */
export const FILE_BROWSER_NAV_QUERY_KEYS = new Set([
  "checkout",
  "file",
  "folder",
  "path",
  "preview",
]);

export function filterStateForFileFilters(state: FilterState): FilterState {
  const next: FilterState = {};
  for (const [k, v] of Object.entries(state)) {
    if (FILE_BROWSER_NAV_QUERY_KEYS.has(k)) continue;
    next[k] = v;
  }
  return next;
}

/** Parse filter state from URL search params */
export function filtersFromSearchParams(searchParams: URLSearchParams): FilterState {
  const state: FilterState = {};
  for (const [key, value] of searchParams) {
    if (!value) continue;
    if (BOOLEAN_PARAM_KEYS.has(key)) {
      state[key] = value === "true" || value === "1";
      continue;
    }
    const existing = state[key];
    if (existing === undefined) {
      state[key] = value;
    } else if (Array.isArray(existing)) {
      (existing as string[]).push(value);
    } else if (typeof existing === "string") {
      state[key] = [existing, value];
    }
  }
  return state;
}

/** Build URL search params from filter state */
export function searchParamsFromFilters(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v) params.append(key, v);
      }
    } else if (typeof value === "boolean" && value) {
      params.set(key, "true");
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }
  return params;
}

/** Build API-ready params from filter state (resolves presets, excludes UI-only keys) */
export function filterStateToApiParams(state: FilterState): Record<string, string> {
  const params: Record<string, string> = {};
  const skipKeys = new Set(["date_preset", "size_preset"]);

  if (state.date_preset && state.date_preset !== "custom") {
    const range = datePresetToRange(String(state.date_preset));
    if (range) {
      params.date_from = range.date_from;
      params.date_to = range.date_to;
    }
  } else {
    if (state.date_from) params.date_from = String(state.date_from);
    if (state.date_to) params.date_to = String(state.date_to);
  }

  if (state.size_preset) {
    const range = sizePresetToRange(String(state.size_preset));
    if (range) {
      if (range.size_min != null) params.size_min = String(range.size_min);
      if (range.size_max != null) params.size_max = String(range.size_max);
    }
  } else {
    if (state.size_min != null && state.size_min !== undefined)
      params.size_min = String(state.size_min);
    if (state.size_max != null && state.size_max !== undefined)
      params.size_max = String(state.size_max);
  }

  for (const [key, value] of Object.entries(filterStateForFileFilters(state))) {
    if (skipKeys.has(key)) continue;
    if (key === "date_from" || key === "date_to" || key === "size_min" || key === "size_max") continue;
    if (value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      const strings = value.filter((v): v is string => typeof v === "string");
      if (strings.length > 0) {
        for (const v of strings) params[key] = v;
      }
    } else if (typeof value === "boolean" && value) {
      params[key] = "true";
    } else if (typeof value === "string") {
      params[key] = value;
    }
  }
  return params;
}

/** Build URLSearchParams from filter state for API requests (supports multi-value params) */
export function filterStateToSearchParams(state: FilterState): URLSearchParams {
  const params = filterStateToApiParams(state);
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    sp.set(key, value);
  }
  const mediaType = state.media_type;
  if (Array.isArray(mediaType) && mediaType.length > 1) {
    sp.delete("media_type");
    mediaType.filter((v): v is string => typeof v === "string").forEach((v) => sp.append("media_type", v));
  }
  const fileType = state.file_type;
  if (Array.isArray(fileType) && fileType.length > 0) {
    sp.delete("file_type");
    fileType.filter((v): v is string => typeof v === "string").forEach((v) => sp.append("file_type", v));
  }
  const assetType = state.asset_type;
  if (Array.isArray(assetType) && assetType.length > 0) {
    sp.delete("asset_type");
    assetType.filter((v): v is string => typeof v === "string").forEach((v) => sp.append("asset_type", v));
  } else if (typeof assetType === "string" && assetType) {
    sp.set("asset_type", assetType);
  }
  return sp;
}

/** Check if filter state has any active filters */
export function hasActiveFilters(state: FilterState): boolean {
  const scoped = filterStateForFileFilters(state);
  return Object.entries(scoped).some(([, value]) => {
    if (value === undefined || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return value;
    return true;
  });
}

/** Get active filters for chip display */
export function getActiveFilters(state: FilterState): ActiveFilter[] {
  const result: ActiveFilter[] = [];
  const seenDate = !!state.date_preset || !!state.date_from || !!state.date_to;
  if (seenDate) {
    let label: string;
    if (state.date_preset && state.date_preset !== "custom") {
      const preset = DATE_PRESETS.find((p) => p.value === state.date_preset);
      label = preset?.label ?? String(state.date_preset);
    } else {
      const from = state.date_from as string | undefined;
      const to = state.date_to as string | undefined;
      label = from && to ? `${from} – ${to}` : from ?? to ?? "Date";
    }
    result.push({ id: "date", value: label, label });
  }
  const seenSize = !!state.size_preset || !!state.size_min || !!state.size_max;
  if (seenSize) {
    let label: string;
    if (state.size_preset) {
      const preset = SIZE_PRESETS.find((p) => p.value === state.size_preset);
      label = preset?.label ?? String(state.size_preset);
    } else {
      const min = state.size_min as string | undefined;
      const max = state.size_max as string | undefined;
      const formatMb = (b: string) => {
        const n = parseInt(b, 10);
        if (isNaN(n)) return b;
        const mb = Math.round(n / (1024 * 1024));
        return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
      };
      label =
        min && max
          ? `${formatMb(min)} – ${formatMb(max)}`
          : min
            ? `≥ ${formatMb(min)}`
            : max
              ? `≤ ${formatMb(max)}`
              : "File size";
    }
    result.push({ id: "file_size", value: label, label });
  }
  for (const [id, value] of Object.entries(filterStateForFileFilters(state))) {
    if (id === "date_from" || id === "date_to" || id === "date_preset" || id === "size_min" || id === "size_max" || id === "size_preset") continue;
    if (value === undefined || value === "" || value === false) continue;
    const def = getFilterDef(id);
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v) {
          const label = def?.options?.find((o) => o.value === v)?.label ?? v;
          result.push({ id, value: v, label });
        }
      }
    } else if (typeof value === "boolean" && value) {
      result.push({ id, value, label: def?.label ?? id });
    } else if (typeof value === "string") {
      const label = def?.options?.find((o) => o.value === value)?.label ?? value;
      result.push({ id, value, label });
    }
  }
  return result;
}

/** Remove a single filter by id and optionally value (for multi-select) */
export function removeFilter(
  state: FilterState,
  id: string,
  value?: string
): FilterState {
  const next = { ...state };
  if (id === "date") {
    delete next.date_preset;
    delete next.date_from;
    delete next.date_to;
    return next;
  }
  if (id === "file_size") {
    delete next.size_preset;
    delete next.size_min;
    delete next.size_max;
    return next;
  }
  const current = next[id];
  if (current === undefined) return next;
  if (Array.isArray(current)) {
    const filtered = current.filter((v) => v !== value);
    if (filtered.length === 0) {
      delete next[id];
    } else {
      next[id] = filtered;
    }
  } else if (value === undefined || current === value) {
    delete next[id];
  }
  return next;
}

/** Format filter value for display (e.g. resolution "1920x1080" -> "1920×1080") */
export function formatFilterValue(id: string, value: string): string {
  if (id === "resolution" && value.includes("x")) {
    return value.replace("x", "×");
  }
  const def = getFilterDef(id);
  return def?.options?.find((o) => o.value === value)?.label ?? value;
}
