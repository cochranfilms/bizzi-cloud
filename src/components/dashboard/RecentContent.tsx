"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FilePreviewModal from "./FilePreviewModal";
import FolderCard from "./FolderCard";
import FolderListRow from "./FolderListRow";
import type { FolderItem } from "./FolderCard";
import { useRecentOpens, type RecentOpenItem } from "@/hooks/useRecentOpens";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import type { RecentFile } from "@/hooks/useCloudFiles";
import DashboardRouteFade from "./DashboardRouteFade";

function toRecentFile(item: RecentOpenItem): RecentFile | null {
  if (item.type !== "file" || !item.driveId) return null;
  return {
    id: item.id,
    name: item.name,
    path: item.path ?? "",
    objectKey: item.objectKey ?? "",
    size: item.size ?? 0,
    modifiedAt: item.modifiedAt ?? null,
    driveId: item.driveId,
    driveName: item.driveName ?? "Unknown",
    contentType: item.contentType ?? null,
    galleryId: item.galleryId ?? null,
  };
}

function toFolderItem(item: RecentOpenItem): FolderItem | null {
  if (item.type !== "folder" || !item.driveId) return null;
  return {
    name: item.name,
    type: "folder",
    key: `drive-${item.id}`,
    items: 0,
    driveId: item.driveId,
  };
}

export default function RecentContent({ basePath = "/dashboard" }: { basePath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const storageDisplayContext = useMemo(() => {
    if (typeof pathname === "string" && pathname.startsWith("/enterprise")) {
      return { locationScope: "enterprise" as const };
    }
    if (typeof pathname === "string" && /^\/team\//.test(pathname)) {
      return { locationScope: "team" as const };
    }
    return { locationScope: "personal" as const };
  }, [pathname]);
  const { items, loading, refresh } = useRecentOpens();
  const { viewMode, cardSize, aspectRatio, thumbnailScale, showCardInfo } = useLayoutSettings();
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const { deleteFile } = useCloudFiles();

  const files = items.filter((i) => i.type === "file").map(toRecentFile).filter(Boolean) as RecentFile[];
  const folders = items.filter((i) => i.type === "folder").map(toFolderItem).filter(Boolean) as FolderItem[];
  const filesHref = `${basePath}/files`;

  const openFolder = (driveId: string) => {
    router.push(`${filesHref}?drive=${driveId}`);
  };

  const ready = !(loading && items.length === 0);

  return (
    <>
      <DashboardRouteFade ready={ready} srOnlyMessage="Loading recent items">
      {items.length === 0 ? (
      <div className="py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Recently opened files and folders will appear here (last 7 days).
        </p>
      </div>
      ) : viewMode === "list" ? (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-x-auto dark:border-neutral-700 dark:bg-neutral-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="w-10 px-3 py-3 font-medium text-neutral-900 dark:text-white" />
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Name</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Type</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Size</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Modified</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Location</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Resolution</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Duration</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Codec</th>
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white" />
              </tr>
            </thead>
            <tbody>
              {folders.map((item) => (
                <FolderListRow
                  key={item.key}
                  item={item}
                  displayContext={storageDisplayContext}
                  onClick={() => item.driveId && openFolder(item.driveId)}
                />
              ))}
              {files.map((file) => (
                <FileListRow
                  key={file.id}
                  file={file}
                  displayContext={storageDisplayContext}
                  onClick={() => setPreviewFile(file)}
                  onDelete={async () => {
                    await deleteFile(file.id);
                    refresh();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className={`grid ${
            viewMode === "thumbnail" ? "gap-3" : "gap-4"
          } ${
            viewMode === "thumbnail"
              ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
              : cardSize === "small"
                ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                : cardSize === "large"
                  ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
                  : "sm:grid-cols-3 md:grid-cols-4"
          }`}
        >
          {folders.map((item) => (
            <FolderCard
              key={item.key}
              item={item}
              onClick={() => item.driveId && openFolder(item.driveId)}
              layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
              layoutAspectRatio={aspectRatio}
              showCardInfo={showCardInfo}
              presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
            />
          ))}
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onClick={() => setPreviewFile(file)}
              onDelete={async () => {
                await deleteFile(file.id);
                refresh();
              }}
              layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
              layoutAspectRatio={aspectRatio}
              thumbnailScale={thumbnailScale}
              showCardInfo={showCardInfo}
              presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
            />
          ))}
        </div>
      )}
      </DashboardRouteFade>
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}
