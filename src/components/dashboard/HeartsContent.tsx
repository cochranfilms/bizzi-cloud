"use client";

import { useMemo, useState } from "react";
import { useBackup } from "@/context/BackupContext";
import { useFilePreviewModalRawLut } from "@/hooks/useFilePreviewModalRawLut";
import { usePathname } from "next/navigation";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FilePreviewModal from "./FilePreviewModal";
import { useHeartedFiles } from "@/hooks/useHeartedFiles";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import type { RecentFile } from "@/hooks/useCloudFiles";
import DashboardRouteFade from "./DashboardRouteFade";

export default function HeartsContent({ basePath = "/dashboard" }: { basePath?: string }) {
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
  const { files, loading, loadingMore, hasMore, loadMore, refresh } = useHeartedFiles();
  const { viewMode, cardSize, aspectRatio, thumbnailScale, showCardInfo } = useLayoutSettings();
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const { deleteFile } = useCloudFiles({ subscribeDriveListing: false });
  const { linkedDrives } = useBackup();
  const filePreviewRawLut = useFilePreviewModalRawLut(previewFile, linkedDrives);

  const ready = !(loading && files.length === 0);

  return (
    <>
      <DashboardRouteFade ready={ready} srOnlyMessage="Loading hearts">
      <>
      {files.length === 0 ? (
      <div className="py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Files you heart will appear here for quick access.
        </p>
      </div>
      ) : viewMode === "list" ? (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-x-auto dark:border-neutral-700 dark:bg-neutral-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
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
      {files.length > 0 && hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      </>
      </DashboardRouteFade>
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          showLUTForVideo={filePreviewRawLut.showLUTForVideo}
          lutConfig={filePreviewRawLut.lutConfig}
          lutLibrary={filePreviewRawLut.lutLibrary}
        />
      )}
    </>
  );
}
