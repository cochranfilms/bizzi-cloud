"use client";

import { useBackup } from "@/context/BackupContext";
import UploadProgressPanel from "./UploadProgressPanel";

/**
 * Floating indicator for background uploads. Stays visible so users can browse
 * the platform while uploads continue. Collapsible to a compact pill.
 * Shows loading spinner for pending files, Done badge when complete, green bar when all done.
 */
export default function BackgroundUploadIndicator() {
  const { fileUploadProgress, cancelFileUpload } = useBackup();

  const show =
    fileUploadProgress &&
    fileUploadProgress.files.length > 0 &&
    (fileUploadProgress.status === "in_progress" || fileUploadProgress.status === "completed");

  if (!show || !fileUploadProgress) return null;

  return (
    <UploadProgressPanel
      fileUploadProgress={fileUploadProgress}
      onCancelFile={cancelFileUpload}
      inline={false}
    />
  );
}
