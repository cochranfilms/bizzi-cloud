"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { buildGalleryHealthAdvisories } from "@/lib/gallery-owner-health-advisories";

interface GalleryDetailHealthAdvisoriesProps {
  galleryId: string;
  settingsHref: string;
  galleryType: "photo" | "video";
  mediaMode: "final" | "raw";
  assets: { name: string }[];
}

export default function GalleryDetailHealthAdvisories({
  galleryId,
  settingsHref,
  galleryType,
  mediaMode,
  assets,
}: GalleryDetailHealthAdvisoriesProps) {
  const { user } = useAuth();
  const [lutCount, setLutCount] = useState<number | undefined>(undefined);
  const names = useMemo(() => assets.map((a) => a.name), [assets]);

  useEffect(() => {
    if (!user || galleryType !== "photo" || mediaMode !== "raw" || assets.length === 0) {
      setLutCount(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/galleries/${galleryId}/lut`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { creative_lut_library?: unknown[] };
        const lib = data.creative_lut_library;
        if (!cancelled) setLutCount(Array.isArray(lib) ? lib.length : 0);
      } catch {
        if (!cancelled) setLutCount(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, galleryId, galleryType, mediaMode, assets.length]);

  const notes = useMemo(
    () =>
      buildGalleryHealthAdvisories({
        kind: galleryType,
        mediaMode,
        assetNames: names,
        lutLibraryCount:
          galleryType === "photo" && mediaMode === "raw" ? lutCount : undefined,
      }),
    [galleryType, mediaMode, names, lutCount]
  );

  if (notes.length === 0) return null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-100">
      <p className="font-medium text-sky-900 dark:text-sky-100">Gallery tips</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sky-900/90 dark:text-sky-200/90">
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-sky-800/80 dark:text-sky-300/90">
        Advisory only —{" "}
        <Link href={settingsHref} className="font-medium underline hover:no-underline">
          open Settings
        </Link>{" "}
        to adjust profile or LUTs.
      </p>
    </div>
  );
}
