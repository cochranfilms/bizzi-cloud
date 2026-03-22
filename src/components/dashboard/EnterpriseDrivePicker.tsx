"use client";

import { FolderOpen, Film, Images } from "lucide-react";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useRouter, useSearchParams } from "next/navigation";
import { filterDriveFoldersByPowerUp } from "@/lib/drive-powerup-filter";
import { useCloudFiles } from "@/hooks/useCloudFiles";

function isSystemDrive(d: { name: string; isCreatorRaw?: boolean }) {
  return (
    d.name === "Storage" ||
    d.name === "Uploads" ||
    d.isCreatorRaw === true ||
    d.name === "Gallery Media"
  );
}

export function EnterpriseDrivePicker() {
  const { setCurrentDrive } = useCurrentFolder();
  const { hasEditor, hasGallerySuite } = useSubscription();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { driveFolders } = useCloudFiles();
  const visibleDrives = filterDriveFoldersByPowerUp(driveFolders, {
    hasEditor,
    hasGallerySuite,
  });
  const systemDrives = visibleDrives.filter((d) =>
    isSystemDrive({ name: d.name, isCreatorRaw: d.isCreatorRaw })
  );

  const handleDriveClick = (id: string, name: string) => {
    setCurrentDrive(id);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("drive", id);
    router.replace(`/enterprise/files?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 shrink-0">
        Choose a drive
      </span>
      <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900">
        {systemDrives.map((d) => {
          const Icon =
            d.isCreatorRaw || d.name === "RAW"
              ? Film
              : d.name === "Gallery Media"
                ? Images
                : FolderOpen;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => handleDriveClick(d.id, d.name)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <Icon className="h-3.5 w-3.5" />
              {d.name === "RAW" || d.isCreatorRaw ? "RAW" : d.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
