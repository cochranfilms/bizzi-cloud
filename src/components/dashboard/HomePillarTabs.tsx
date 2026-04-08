"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LinkedDrive } from "@/types/backup";
import { useBackup } from "@/context/BackupContext";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";

const teamAware = (name: string) => name.replace(/^\[Team\]\s+/, "");

type PillarKey = "storage" | "raw" | "gallery";

function createdMs(d: LinkedDrive): number {
  if (!d.created_at) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(d.created_at);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function pickCanonicalStorage(linkedDrives: LinkedDrive[]): LinkedDrive | undefined {
  const candidates = linkedDrives.filter(
    (d) => teamAware(d.name) === "Storage" && d.is_creator_raw !== true
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return candidates.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
}

function pickCanonicalRaw(linkedDrives: LinkedDrive[]): LinkedDrive | undefined {
  const raw = linkedDrives.filter((d) => d.is_creator_raw === true);
  if (raw.length === 0) return undefined;
  if (raw.length === 1) return raw[0];
  return raw.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
}

function pickCanonicalGallery(linkedDrives: LinkedDrive[]): LinkedDrive | undefined {
  const candidates = linkedDrives.filter((d) => teamAware(d.name) === "Gallery Media");
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return candidates.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
}

/**
 * Home hub only: center tabs that switch the embedded FileGrid pillar via `?drive=`.
 */
export default function HomePillarTabs() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { linkedDrives, loading: drivesLoading } = useBackup();
  const { hasEditor, hasGallerySuite, loading: powerUpLoading } = useEffectivePowerUps();

  const pillars = useMemo(() => {
    const rows: { key: PillarKey; label: string; drive: LinkedDrive }[] = [];
    const storage = pickCanonicalStorage(linkedDrives);
    if (storage) {
      rows.push({ key: "storage", label: "Storage", drive: storage });
    }
    if (hasEditor) {
      const raw = pickCanonicalRaw(linkedDrives);
      if (raw) {
        rows.push({ key: "raw", label: "RAW", drive: raw });
      }
    }
    if (hasGallerySuite) {
      const gallery = pickCanonicalGallery(linkedDrives);
      if (gallery) {
        rows.push({ key: "gallery", label: "Gallery Media", drive: gallery });
      }
    }
    return rows;
  }, [linkedDrives, hasEditor, hasGallerySuite]);

  const activeDriveId = searchParams.get("drive");

  const switchToDrive = useCallback(
    (driveId: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("drive", driveId);
      sp.delete("path");
      sp.delete("folder");
      const q = sp.toString();
      router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  if (drivesLoading || powerUpLoading) return null;
  if (pillars.length < 2) return null;

  const tabCls = (active: boolean) =>
    [
      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
      active
        ? "bg-[var(--enterprise-primary)]/15 text-neutral-900 dark:text-white ring-1 ring-[var(--enterprise-primary)]/40"
        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white",
    ].join(" ");

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1 sm:gap-2"
      role="tablist"
      aria-label="Storage areas"
    >
      {pillars.map(({ key, label, drive }) => {
        const active = activeDriveId === drive.id;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            className={tabCls(active)}
            onClick={() => switchToDrive(drive.id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
