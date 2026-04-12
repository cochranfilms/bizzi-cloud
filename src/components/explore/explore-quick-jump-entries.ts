import type { ExploreNavItem } from "@/content/explore-sections-data";

export type QuickJumpEntry = {
  id: string;
  label: string;
  searchText: string;
};

function flattenNav(items: ExploreNavItem[]): QuickJumpEntry[] {
  const out: QuickJumpEntry[] = [];
  for (const item of items) {
    const parts = [item.label, ...item.keywords, ...item.aliases];
    out.push({
      id: item.id,
      label: item.label,
      searchText: parts.join(" ").toLowerCase(),
    });
    if (item.children) {
      for (const ch of item.children) {
        out.push({
          id: ch.id,
          label: `${item.label} — ${ch.label}`,
          searchText: `${ch.label} ${item.label}`.toLowerCase(),
        });
      }
    }
  }
  return out;
}

export function buildQuickJumpEntries(nav: ExploreNavItem[]): QuickJumpEntry[] {
  return flattenNav(nav);
}
