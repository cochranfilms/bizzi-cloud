"use client";

import { useCallback, useMemo } from "react";
import { HardDrive } from "lucide-react";
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

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
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
            onClick={() => switchToDrive(drive.id)}
            className={[
              "group flex min-h-[2.75rem] min-w-[8.5rem] max-w-[14rem] flex-1 items-center gap-2.5 rounded-xl border-2 px-4 py-2.5 text-left text-sm font-semibold transition-all sm:flex-initial sm:min-w-[9.5rem]",
              active
                ? "border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)] text-white shadow-md shadow-[color-mix(in_srgb,var(--enterprise-primary)_35%,transparent)] dark:text-white"
                : "border-neutral-200/90 bg-white text-neutral-800 shadow-sm hover:border-[color-mix(in_srgb,var(--enterprise-primary)_55%,transparent)] hover:shadow-md dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-[color-mix(in_srgb,var(--enterprise-primary)_45%,transparent)]",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                active
                  ? " bg-white/20 text-white"
                  : "bg-[var(--enterprise-primary)]/12 text-[var(--enterprise-primary)] group-hover:bg-[var(--enterprise-primary)]/18 dark:bg-white/10",
              ].join(" ")}
            >
              <HardDrive className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
