/**
 * Keep the Transfers system root first among sibling folders so it stays visible.
 */

function rowNameAndRole(x: object): { name: string; role: string | undefined } {
  const r = x as { name?: unknown; system_folder_role?: unknown };
  return {
    name: String(r.name ?? "").trim(),
    role: typeof r.system_folder_role === "string" ? r.system_folder_role : undefined,
  };
}

/** Use on API/client rows that carry Firestore-style `system_folder_role`. */
export function compareStorageFolderRowsTransfersRootFirst(a: object, b: object): number {
  const A = rowNameAndRole(a);
  const B = rowNameAndRole(b);
  const aXfer = A.role === "transfers_root" ? 0 : 1;
  const bXfer = B.role === "transfers_root" ? 0 : 1;
  if (aXfer !== bXfer) return aXfer - bXfer;
  return A.name.localeCompare(B.name, undefined, { sensitivity: "base" });
}

export function compareFolderItemsTransfersRootFirst(
  a: { name: string; systemFolderRole?: string | null },
  b: { name: string; systemFolderRole?: string | null }
): number {
  const aXfer = a.systemFolderRole === "transfers_root" ? 0 : 1;
  const bXfer = b.systemFolderRole === "transfers_root" ? 0 : 1;
  if (aXfer !== bXfer) return aXfer - bXfer;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
