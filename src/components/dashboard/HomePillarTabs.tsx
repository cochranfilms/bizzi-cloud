"use client";

import { useCallback, useMemo } from "react";
import { HardDrive } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useBackup } from "@/context/BackupContext";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { buildHomePillarRows } from "@/lib/home-pillar-drives";

/**
 * Home hub only: center tabs that switch the embedded FileGrid pillar via `?drive=`.
 */
export default function HomePillarTabs() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { linkedDrives, loading: drivesLoading } = useBackup();
  const { hasEditor, hasGallerySuite, loading: powerUpLoading } = useEffectivePowerUps();

  const pillars = useMemo(
    () => buildHomePillarRows(linkedDrives, { hasEditor, hasGallerySuite }),
    [linkedDrives, hasEditor, hasGallerySuite]
  );

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
      className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2"
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
              "group flex min-h-9 min-w-[6.75rem] max-w-[12rem] flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold shadow-sm transition-all sm:flex-initial sm:min-w-[7.25rem] sm:px-3 sm:text-sm",
              active
                ? "bg-[var(--enterprise-primary)] text-white shadow-md shadow-[color-mix(in_srgb,var(--enterprise-primary)_30%,transparent)] dark:text-white"
                : "border-0 bg-white text-neutral-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:shadow-md dark:bg-neutral-900 dark:text-neutral-100",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-8 sm:w-8",
                active
                  ? "bg-white/20 text-white"
                  : "bg-[var(--enterprise-primary)]/12 text-[var(--enterprise-primary)] group-hover:bg-[var(--enterprise-primary)]/18 dark:bg-white/10",
              ].join(" ")}
            >
              <HardDrive className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
