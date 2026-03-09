/**
 * Client-side filter helpers: URL parsing, filter state, chip labels.
 */

import { getFilterDef, type FilterDef } from "./filter-config";

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

/** Parse filter state from URL search params */
export function filtersFromSearchParams(searchParams: URLSearchParams): FilterState {
  const state: FilterState = {};
  for (const [key, value] of searchParams) {
    if (!value) continue;
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

/** Map filter state keys to API param names */
export function filterStateToApiParams(state: FilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.date_from) params.date_from = String(state.date_from);
  if (state.date_to) params.date_to = String(state.date_to);
  for (const [key, value] of Object.entries(state)) {
    if (key === "date_from" || key === "date_to") continue;
    if (value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v) params[key] = v; // API may need multiple - use last for simple case
      });
    } else if (typeof value === "string") {
      params[key] = value;
    }
  }
  return params;
}

/** Check if filter state has any active filters */
export function hasActiveFilters(state: FilterState): boolean {
  return Object.entries(state).some(([, value]) => {
    if (value === undefined || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return value;
    return true;
  });
}

/** Get active filters for chip display */
export function getActiveFilters(state: FilterState): ActiveFilter[] {
  const result: ActiveFilter[] = [];
  const seenDate = !!state.date_from || !!state.date_to;
  if (seenDate) {
    const from = state.date_from as string | undefined;
    const to = state.date_to as string | undefined;
    const label = from && to ? `${from} – ${to}` : from ?? to ?? "Date";
    result.push({ id: "date", value: label, label });
  }
  for (const [id, value] of Object.entries(state)) {
    if (id === "date_from" || id === "date_to") continue;
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
