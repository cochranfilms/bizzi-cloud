import type { StreamCacheEntry } from "@/types/mount";

export function chunkKey(objectKey: string, start: number, end: number): string {
  return `${objectKey}:${start}-${end}`;
}

export function parseChunkKey(key: string): {
  objectKey: string;
  start: number;
  end: number;
} | null {
  const lastColon = key.lastIndexOf(":");
  if (lastColon === -1) return null;
  const objectKey = key.slice(0, lastColon);
  const range = key.slice(lastColon + 1);
  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    objectKey,
    start: parseInt(match[1], 10),
    end: parseInt(match[2], 10),
  };
}

export function validateStreamCacheEntry(entry: unknown): entry is StreamCacheEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.key === "string" &&
    typeof e.object_key === "string" &&
    typeof e.start === "number" &&
    typeof e.end === "number" &&
    typeof e.local_path === "string" &&
    typeof e.size_bytes === "number" &&
    typeof e.last_accessed_at === "number" &&
    typeof e.created_at === "number"
  );
}
