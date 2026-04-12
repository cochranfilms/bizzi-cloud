/**
 * Keep the Transfers system root first among sibling folders so it stays visible.
 * Other siblings sort by recency (newest first) so nested folders behave like root folders
 * for quick access — alphabetical-only ordering buried newly created folders.
 */

function rowNameAndRole(x: object): { name: string; role: string | undefined } {
  const r = x as { name?: unknown; system_folder_role?: unknown };
  return {
    name: String(r.name ?? "").trim(),
    role: typeof r.system_folder_role === "string" ? r.system_folder_role : undefined,
  };
}

/** Milliseconds for sorting; supports Firestore Timestamp, ISO strings, and JSON `{ seconds }` shapes. */
export function storageFolderRowRecencyMs(row: object): number {
  const r = row as { updated_at?: unknown; created_at?: unknown };
  const asMs = (v: unknown): number | null => {
    if (v == null) return null;
    if (typeof v === "string" && v.trim()) {
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : null;
    }
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "object") {
      const o = v as {
        toDate?: () => Date;
        seconds?: unknown;
        _seconds?: unknown;
        nanoseconds?: unknown;
        _nanoseconds?: unknown;
      };
      if (typeof o.toDate === "function") {
        try {
          return o.toDate().getTime();
        } catch {
          return null;
        }
      }
      const secRaw = o.seconds ?? o._seconds;
      const sec = typeof secRaw === "number" && Number.isFinite(secRaw) ? secRaw : null;
      if (sec != null) {
        const nsRaw = o.nanoseconds ?? o._nanoseconds;
        const ns = typeof nsRaw === "number" && Number.isFinite(nsRaw) ? nsRaw : 0;
        return sec * 1000 + ns / 1e6;
      }
    }
    return null;
  };
  return asMs(r.updated_at) ?? asMs(r.created_at) ?? 0;
}

/** Use on API/client rows that carry Firestore-style `system_folder_role`. */
export function compareStorageFolderRowsTransfersRootFirst(a: object, b: object): number {
  const A = rowNameAndRole(a);
  const B = rowNameAndRole(b);
  const aXfer = A.role === "transfers_root" ? 0 : 1;
  const bXfer = B.role === "transfers_root" ? 0 : 1;
  if (aXfer !== bXfer) return aXfer - bXfer;
  const ta = storageFolderRowRecencyMs(a);
  const tb = storageFolderRowRecencyMs(b);
  if (tb !== ta) return tb - ta;
  return A.name.localeCompare(B.name, undefined, { sensitivity: "base" });
}

export function compareFolderItemsTransfersRootFirst(
  a: { name: string; systemFolderRole?: string | null; folderRecencyMs?: number },
  b: { name: string; systemFolderRole?: string | null; folderRecencyMs?: number }
): number {
  const aXfer = a.systemFolderRole === "transfers_root" ? 0 : 1;
  const bXfer = b.systemFolderRole === "transfers_root" ? 0 : 1;
  if (aXfer !== bXfer) return aXfer - bXfer;
  const ta = typeof a.folderRecencyMs === "number" && Number.isFinite(a.folderRecencyMs) ? a.folderRecencyMs : 0;
  const tb = typeof b.folderRecencyMs === "number" && Number.isFinite(b.folderRecencyMs) ? b.folderRecencyMs : 0;
  if (tb !== ta) return tb - ta;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
