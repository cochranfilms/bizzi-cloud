/**
 * Collapses duplicate system pillars (two RAW drives, legacy Storage + Uploads, etc.)
 * so transfer pickers and folder grids show one tile per pillar across personal, team, and org.
 */
import type { LinkedDrive } from "@/types/backup";
import { linkedDriveDisplayKey } from "@/lib/move-and-folder-naming";

function driveCreatedMs(d: LinkedDrive): number {
  const t = d.created_at;
  if (!t) return Number.MAX_SAFE_INTEGER;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/** storage | raw | gallery | other:<id> */
export function linkedDrivePillarDedupeKey(d: LinkedDrive): string {
  if (d.is_creator_raw === true) return "raw";
  const base = linkedDriveDisplayKey(d.name);
  if (base === "raw") return "raw";
  if (base.includes("gallery")) return "gallery";
  if (base === "storage") return "storage";
  return `other:${d.id}`;
}

export function dedupeScopedPillarDrives(scoped: LinkedDrive[]): LinkedDrive[] {
  const buckets = new Map<string, LinkedDrive[]>();
  for (const d of scoped) {
    const key = linkedDrivePillarDedupeKey(d);
    const arr = buckets.get(key) ?? [];
    arr.push(d);
    buckets.set(key, arr);
  }

  const out: LinkedDrive[] = [];
  for (const [, arr] of buckets) {
    if (arr.length === 1) {
      out.push(arr[0]!);
      continue;
    }
    const sorted = [...arr].sort((a, b) => {
      const av = a.folder_model_version === 2 ? 1 : 0;
      const bv = b.folder_model_version === 2 ? 1 : 0;
      if (bv !== av) return bv - av;
      return driveCreatedMs(a) - driveCreatedMs(b);
    });
    out.push(sorted[0]!);
  }

  const rank = (d: LinkedDrive) => {
    const k = linkedDrivePillarDedupeKey(d);
    if (k === "storage") return 0;
    if (k === "raw") return 1;
    if (k === "gallery") return 2;
    return 3;
  };

  return out.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}
