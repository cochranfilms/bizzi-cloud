/**
 * Transfer delivery: resolve file rows from transfer_items subcollection or legacy parent.files.
 */
import type { Firestore } from "firebase-admin/firestore";

export const TRANSFER_ITEMS_SUBCOLLECTION = "items";

/** Lifecycle values that mean the package is not recipient-visible. */
const UNPUBLISHED_LIFECYCLES = new Set([
  "draft",
  "uploading",
  "finalizing",
  "failed",
]);

/** Legacy docs omit transfer_lifecycle — treat as published. */
export function transferIsRecipientVisible(parentData: Record<string, unknown>): boolean {
  const lifecycle = parentData.transfer_lifecycle as string | undefined;
  if (!lifecycle) return true;
  return !UNPUBLISHED_LIFECYCLES.has(lifecycle);
}

/** Shape expected by transfer download/preview routes (snake_case file fields). */
export type TransferFileRowSnake = {
  id: string;
  name: string;
  path: string;
  type?: "file";
  views?: number;
  downloads?: number;
  backup_file_id?: string | null;
  object_key?: string | null;
};

export function dedupeIncomingTransferFiles<
  T extends { name: string; path: string; backupFileId?: string; objectKey?: string },
>(files: T[]): T[] {
  const out: T[] = [];
  const seenBid = new Set<string>();
  const seenPathName = new Set<string>();
  for (const f of files) {
    const bid =
      typeof f.backupFileId === "string" && f.backupFileId.trim() ? f.backupFileId.trim() : "";
    const pn = `${f.path}::${f.name}`;
    if (bid) {
      if (seenBid.has(bid)) continue;
      seenBid.add(bid);
    } else {
      if (seenPathName.has(pn)) continue;
      seenPathName.add(pn);
    }
    out.push(f);
  }
  return out;
}

/**
 * Load transfer file list: prefer items subcollection (ordered), else embedded legacy array.
 */
export async function loadTransferFilesForApi(
  db: Firestore,
  slug: string,
  parentData: Record<string, unknown>
): Promise<TransferFileRowSnake[]> {
  const itemsSnap = await db
    .collection("transfers")
    .doc(slug)
    .collection(TRANSFER_ITEMS_SUBCOLLECTION)
    .orderBy("sort_index", "asc")
    .get();

  if (!itemsSnap.empty) {
    return itemsSnap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: (d.transfer_file_id as string) ?? docSnap.id,
        name: (d.display_name as string) ?? (d.name as string) ?? "",
        path: (d.display_path as string) ?? (d.path as string) ?? "",
        type: "file",
        views: (d.views as number) ?? 0,
        downloads: (d.downloads as number) ?? 0,
        backup_file_id: (d.backup_file_id as string) ?? null,
        object_key: (d.object_key as string) ?? null,
      };
    });
  }

  const legacy = (parentData.files as unknown[]) ?? [];
  return legacy.map((raw) => {
    const f = raw as Record<string, unknown>;
    const bid = f.backup_file_id;
    const ok = f.object_key;
    return {
      id: f.id as string,
      name: f.name as string,
      path: f.path as string,
      type: "file" as const,
      views: (f.views as number) ?? 0,
      downloads: (f.downloads as number) ?? 0,
      backup_file_id: typeof bid === "string" ? bid : null,
      object_key: typeof ok === "string" ? ok : null,
    };
  });
}
