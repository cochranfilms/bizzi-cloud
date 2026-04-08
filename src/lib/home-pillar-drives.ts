import type { LinkedDrive } from "@/types/backup";

export type HomePillarKey = "storage" | "raw" | "gallery";

const teamAware = (name: string) => name.replace(/^\[Team\]\s+/, "");

function createdMs(d: LinkedDrive): number {
  if (!d.created_at) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(d.created_at);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

export function pickCanonicalStorage(linkedDrives: LinkedDrive[]): LinkedDrive | undefined {
  const candidates = linkedDrives.filter(
    (d) => teamAware(d.name) === "Storage" && d.is_creator_raw !== true
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return candidates.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
}

export function pickCanonicalRaw(linkedDrives: LinkedDrive[]): LinkedDrive | undefined {
  const raw = linkedDrives.filter((d) => d.is_creator_raw === true);
  if (raw.length === 0) return undefined;
  if (raw.length === 1) return raw[0];
  return raw.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
}

export function pickCanonicalGallery(linkedDrives: LinkedDrive[]): LinkedDrive | undefined {
  const candidates = linkedDrives.filter((d) => teamAware(d.name) === "Gallery Media");
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return candidates.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
}

export function buildHomePillarRows(
  linkedDrives: LinkedDrive[],
  options: { hasEditor: boolean; hasGallerySuite: boolean }
): { key: HomePillarKey; label: string; drive: LinkedDrive }[] {
  const rows: { key: HomePillarKey; label: string; drive: LinkedDrive }[] = [];
  const storage = pickCanonicalStorage(linkedDrives);
  if (storage) {
    rows.push({ key: "storage", label: "Storage", drive: storage });
  }
  if (options.hasEditor) {
    const raw = pickCanonicalRaw(linkedDrives);
    if (raw) {
      rows.push({ key: "raw", label: "RAW", drive: raw });
    }
  }
  if (options.hasGallerySuite) {
    const gallery = pickCanonicalGallery(linkedDrives);
    if (gallery) {
      rows.push({ key: "gallery", label: "Gallery Media", drive: gallery });
    }
  }
  return rows;
}
