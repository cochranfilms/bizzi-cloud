"use client";

import { useEffect, useMemo, useState } from "react";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isCreatorRawDriveId } from "@/lib/creator-raw-drive";
import type { LinkedDrive } from "@/types/backup";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";

type RawDriveLutPayload = {
  config: CreativeLUTConfig;
  library: CreativeLUTLibraryEntry[];
};

export type FilePreviewModalRawLutProps = {
  showLUTForVideo: boolean;
  lutConfig: CreativeLUTConfig | null;
  lutLibrary: CreativeLUTLibraryEntry[] | null;
};

/**
 * When a dashboard file preview is open on a Creator RAW drive, fetch that drive's LUT library
 * and return props for {@link FilePreviewModal} (same behavior as FileGrid / HomeStorageView).
 */
export function useFilePreviewModalRawLut(
  previewFile: RecentFile | null,
  linkedDrives: Pick<LinkedDrive, "id" | "is_creator_raw">[]
): FilePreviewModalRawLutProps {
  const [previewRawDriveLut, setPreviewRawDriveLut] = useState<RawDriveLutPayload | null>(null);

  const showLUTForVideo = Boolean(
    previewFile && isCreatorRawDriveId(previewFile.driveId, linkedDrives)
  );

  useEffect(() => {
    if (!previewFile?.driveId || !isCreatorRawDriveId(previewFile.driveId, linkedDrives)) {
      setPreviewRawDriveLut(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        if (!token || cancelled) return;
        const res = await fetch(`/api/drives/${encodeURIComponent(previewFile.driveId)}/lut`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setPreviewRawDriveLut(null);
          return;
        }
        const data = (await res.json()) as {
          creative_lut_config?: CreativeLUTConfig | null;
          creative_lut_library?: CreativeLUTLibraryEntry[];
        };
        if (cancelled) return;
        setPreviewRawDriveLut({
          config: (data.creative_lut_config ?? {}) as CreativeLUTConfig,
          library: data.creative_lut_library ?? [],
        });
      } catch {
        if (!cancelled) setPreviewRawDriveLut(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewFile?.driveId, previewFile?.id, linkedDrives]);

  return useMemo(
    () => ({
      showLUTForVideo,
      lutConfig: showLUTForVideo ? (previewRawDriveLut?.config ?? null) : null,
      lutLibrary: showLUTForVideo ? (previewRawDriveLut?.library ?? null) : null,
    }),
    [showLUTForVideo, previewRawDriveLut]
  );
}
