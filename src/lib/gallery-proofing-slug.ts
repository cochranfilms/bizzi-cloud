import { slugify } from "@/lib/gallery-slug";

/**
 * Stable folder slug at list create: human-readable base + doc id suffix (unique without extra queries).
 */
export function assignProofingFolderSlug(params: {
  title: string | null | undefined;
  listDocId: string;
  clientName?: string | null;
}): string {
  const { title, listDocId, clientName } = params;
  const idPart = listDocId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || listDocId.slice(0, 8);
  const raw =
    (typeof title === "string" && title.trim()) ||
    (typeof clientName === "string" && clientName.trim()) ||
    "";
  const base = raw ? slugify(raw).slice(0, 48) : "list";
  return `${base}-${idPart}`;
}

export function assignMergeSlug(): string {
  return `merge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
