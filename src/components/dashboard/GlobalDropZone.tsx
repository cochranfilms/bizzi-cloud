"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Upload } from "lucide-react";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise, useEnterpriseOptional } from "@/context/EnterpriseContext";
import { useUppyUpload } from "@/context/UppyUploadContext";
import { useAuth } from "@/context/AuthContext";
import { useThemeResolved } from "@/context/ThemeContext";
import { useDashboardAppearanceOptional } from "@/context/DashboardAppearanceContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { collectFilesFromDataTransfer } from "@/lib/browser-data-transfer-files";
import {
  resolveUploadDestination,
  getDropOverlayCopy,
  isCreatorMainRoute,
} from "@/lib/upload-destination-resolve";
import { creatorRawClientAllowsUploadAttempt } from "@/lib/creator-raw-upload-policy";
import { CREATOR_RAW_REJECTION_MESSAGES } from "@/lib/creator-raw-media-config";
import { resolveImmersiveWorkspaceAccent } from "@/lib/immersive-workspace-accent";
import { hexToRgb, immersiveAppVariantBackdropStyle } from "@/lib/immersive-app-backdrop";

/** Same veil as `ImmersiveFilePreviewShell` (app variant). */
const IMMERSIVE_BACKDROP_BLUR = "blur(56px) saturate(1.08)";

/** Lucide / `UploadCloudProgress` cloud silhouette (viewBox 0 0 24 24). */
const DROP_OVERLAY_CLOUD_D =
  "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z";

/**
 * Global drag-and-drop zone. Overlay copy and drop target both come from
 * resolveUploadDestination — one source of truth.
 */
export default function GlobalDropZone() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { linkedDrives, getOrCreateStorageDrive, setFileUploadErrorMessage } = useBackup();
  const {
    currentDriveId,
    currentDrivePath,
    storageParentFolderId,
    storageUploadFolderLabel,
    selectedWorkspaceId,
  } = useCurrentFolder();
  const { org } = useEnterprise();
  const { user } = useAuth();
  const openPanel = useUppyUpload()?.openPanel;
  const themeResolved = useThemeResolved();
  const isDark = themeResolved === "dark";
  const appearance = useDashboardAppearanceOptional();
  const enterpriseOptional = useEnterpriseOptional();
  const teamWs = usePersonalTeamWorkspace();

  const workspaceAccent = useMemo(
    () =>
      resolveImmersiveWorkspaceAccent({
        pathname,
        orgTheme: enterpriseOptional?.org?.theme ?? enterpriseOptional?.organization?.theme,
        teamThemeId: teamWs?.teamThemeId,
        dashboardAccentHex: appearance?.accentColor ?? "#00BFFF",
      }),
    [
      pathname,
      enterpriseOptional?.org?.theme,
      enterpriseOptional?.organization?.theme,
      teamWs?.teamThemeId,
      appearance?.accentColor,
    ]
  );

  const accentRgb = useMemo(() => {
    const rgb = hexToRgb(workspaceAccent);
    return rgb ? `${rgb.r},${rgb.g},${rgb.b}` : "0,191,255";
  }, [workspaceAccent]);

  const immersiveDropBackdropStyle = useMemo((): CSSProperties => {
    const layers = immersiveAppVariantBackdropStyle({
      accentRgb,
      isDark,
      pathname,
    });
    return {
      WebkitBackdropFilter: IMMERSIVE_BACKDROP_BLUR,
      backdropFilter: IMMERSIVE_BACKDROP_BLUR,
      ...layers,
    };
  }, [accentRgb, isDark, pathname]);

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragCounterRef = useRef(0);
  const overlayCancelRef = useRef(0);
  const [dropOverlay, setDropOverlay] = useState<{ title: string; subtitle: string } | null>(
    null
  );

  const isGalleryMediaDrive = Boolean(
    currentDriveId && linkedDrives.find((d) => d.id === currentDriveId)?.name === "Gallery Media"
  );

  const isActiveRoute = pathname
    ? (pathname.startsWith("/dashboard") ||
        pathname.startsWith("/enterprise") ||
        pathname.startsWith("/desktop/app") ||
        pathname.startsWith("/team/")) &&
      !pathname.includes("/galleries/") &&
      !pathname.includes("/transfers")
    : false;

  const isEnterpriseFilesNoDrive =
    pathname === "/enterprise/files" &&
    !searchParams?.get("drive") &&
    !searchParams?.get("drive_id");

  const shouldShowOverlay =
    isActiveRoute && !isGalleryMediaDrive && !isEnterpriseFilesNoDrive;

  const refreshOverlayCopy = useCallback(async () => {
    const gen = ++overlayCancelRef.current;
    const resolved = await resolveUploadDestination({
      pathname,
      searchParams,
      currentDriveId,
      currentDrivePath: currentDrivePath ?? "",
      linkedDrives,
      sourceSurface: (() => {
        const files =
          pathname === "/dashboard/files" ||
          pathname === "/enterprise/files" ||
          pathname === "/desktop/app/files" ||
          (!!pathname?.startsWith("/team/") && pathname.includes("/files"));
        if (files) return "files_global_drop";
        if (isCreatorMainRoute(pathname)) return "creator_global_drop";
        return "home_global_drop";
      })(),
      isEnterpriseFilesNoDrive,
      isGalleryMediaDrive,
      getOrCreateStorageDrive: async () => {
        const d = await getOrCreateStorageDrive();
        return { id: d.id, name: d.name };
      },
    });
    if (gen !== overlayCancelRef.current) return;
    setDropOverlay(
      getDropOverlayCopy(resolved, {
        storageParentFolderId,
        storageFolderDisplayName: storageUploadFolderLabel,
      })
    );
  }, [
    pathname,
    searchParams,
    currentDriveId,
    currentDrivePath,
    linkedDrives,
    isEnterpriseFilesNoDrive,
    isGalleryMediaDrive,
    getOrCreateStorageDrive,
    storageParentFolderId,
    storageUploadFolderLabel,
  ]);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
      overlayCancelRef.current += 1;
      setDropOverlay(null);

      if (!shouldShowOverlay || !openPanel) return;

      let fileList: File[];
      try {
        fileList = await collectFilesFromDataTransfer(e.dataTransfer ?? null);
      } catch {
        const files = e.dataTransfer?.files;
        if (!files?.length) return;
        fileList = Array.from(files);
      }
      fileList = fileList.filter((f) => f && f.size !== undefined);
      if (fileList.length === 0) return;

      try {
        const isFilesView =
          pathname === "/dashboard/files" ||
          pathname === "/enterprise/files" ||
          pathname === "/desktop/app/files" ||
          (!!pathname?.startsWith("/team/") && pathname.includes("/files"));

        const resolved = await resolveUploadDestination({
          pathname,
          searchParams,
          currentDriveId,
          currentDrivePath: currentDrivePath ?? "",
          linkedDrives,
          sourceSurface: isFilesView
            ? "files_global_drop"
            : isCreatorMainRoute(pathname)
              ? "creator_global_drop"
              : "home_global_drop",
          isEnterpriseFilesNoDrive,
          isGalleryMediaDrive,
          getOrCreateStorageDrive: async () => {
            const d = await getOrCreateStorageDrive();
            return { id: d.id, name: d.name };
          },
        });

        if (!resolved.success) {
          setFileUploadErrorMessage(resolved.userMessage);
          return;
        }

        let files = fileList;
        if (resolved.destinationMode === "creator_raw" && resolved.isLocked) {
          const allowed = files.filter((f) => creatorRawClientAllowsUploadAttempt(f.name));
          const skipped = files.length - allowed.length;
          if (skipped > 0) {
            setFileUploadErrorMessage(
              `${skipped} file(s) skipped — ${CREATOR_RAW_REJECTION_MESSAGES.nonMediaLeaf}`
            );
          }
          files = allowed;
          if (files.length === 0) return;
        }

        let finalDriveId = resolved.driveId;
        let workspaceId: string | null = null;
        const panelOptionsBase = {
          uploadIntent: resolved.uploadIntent,
          lockedDestination: resolved.isLocked,
          sourceSurface: resolved.sourceSurface,
          destinationMode: resolved.destinationMode,
          routeContext: resolved.routeContext,
          targetDriveName: resolved.driveName,
          resolvedBy: resolved.resolvedBy,
          driveName: resolved.driveName,
        };

        if ((pathname?.startsWith("/enterprise") || pathname?.startsWith("/desktop")) && org?.id && user) {
          try {
            const token = await user.getIdToken();
            if (!token) throw new Error("Not authenticated");
            const params = new URLSearchParams({
              drive_id: finalDriveId,
              organization_id: org.id,
            });
            if (selectedWorkspaceId) params.set("workspace_id", selectedWorkspaceId);
            const res = await fetch(`/api/workspaces/default-for-drive?${params}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Could not resolve workspace");
            const data = (await res.json()) as {
              workspace_id: string;
              drive_id: string;
              drive_name?: string;
              workspace_name?: string;
              scope_label?: string;
            };
            workspaceId = data.workspace_id;
            finalDriveId = data.drive_id ?? finalDriveId;
            openPanel(finalDriveId, resolved.pathPrefix, workspaceId, {
              ...panelOptionsBase,
              initialFiles: files,
              driveName: data.drive_name ?? panelOptionsBase.driveName,
              workspaceName: data.workspace_name ?? null,
              scopeLabel: data.scope_label ?? null,
              storageFolderId: storageParentFolderId,
              storageFolderDisplayName: storageUploadFolderLabel,
            });
            return;
          } catch (err) {
            console.error("Workspace resolve failed:", err);
            setFileUploadErrorMessage("Could not resolve workspace for upload. Try again.");
            return;
          }
        }

        openPanel(finalDriveId, resolved.pathPrefix, workspaceId, {
          ...panelOptionsBase,
          initialFiles: files,
          storageFolderId: storageParentFolderId,
          storageFolderDisplayName: storageUploadFolderLabel,
        });
      } catch (err) {
        console.error("Global drop upload failed:", err);
      }
    },
    [
      shouldShowOverlay,
      openPanel,
      currentDriveId,
      currentDrivePath,
      selectedWorkspaceId,
      linkedDrives,
      getOrCreateStorageDrive,
      pathname,
      searchParams,
      org?.id,
      user,
      isEnterpriseFilesNoDrive,
      isGalleryMediaDrive,
      setFileUploadErrorMessage,
      storageParentFolderId,
      storageUploadFolderLabel,
    ]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!shouldShowOverlay) return;
      if (!e.dataTransfer?.types?.includes("Files")) return;

      e.preventDefault();
      dragCounterRef.current += 1;
      isDraggingRef.current = true;
      setIsDragging(true);
      if (dragCounterRef.current === 1) {
        setDropOverlay({
          title: "Drop files to upload",
          subtitle: "Resolving upload destination…",
        });
        void refreshOverlayCopy();
      }
    },
    [shouldShowOverlay, refreshOverlayCopy]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
      overlayCancelRef.current += 1;
      setDropOverlay(null);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const clearDragOverlay = useCallback(() => {
    dragCounterRef.current = 0;
    overlayCancelRef.current += 1;
    isDraggingRef.current = false;
    setIsDragging(false);
    setDropOverlay(null);
  }, []);

  /** Leaving a drag-active route must not leave an invisible full-screen blocker (z-[100]) behind. */
  useEffect(() => {
    if (!shouldShowOverlay) {
      clearDragOverlay();
    }
  }, [shouldShowOverlay, clearDragOverlay]);

  useEffect(() => {
    if (!shouldShowOverlay) return;

    const onDragEnter = (e: DragEvent) => handleDragEnter(e);
    const onDragLeave = (e: DragEvent) => handleDragLeave(e);
    const onDragOver = (e: DragEvent) => handleDragOver(e);
    const onDrop = (e: DragEvent) => handleDrop(e);

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [shouldShowOverlay, handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  /**
   * dragenter/dragleave counters desync easily (Esc, drop outside window, child-element traversal).
   * dragend + Escape + tab hide recover a stuck overlay that would block all clicks while the app keeps updating.
   */
  useEffect(() => {
    if (!shouldShowOverlay) return;

    const onDragEndWindow = () => clearDragOverlay();
    window.addEventListener("dragend", onDragEndWindow, true);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearDragOverlay();
    };
    window.addEventListener("keydown", onKeyDown, true);

    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (dragCounterRef.current > 0 || isDraggingRef.current) clearDragOverlay();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("dragend", onDragEndWindow, true);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shouldShowOverlay, clearDragOverlay]);

  if (!isDragging || !shouldShowOverlay) return null;

  const title = dropOverlay?.title ?? "Drop files to upload";
  const subtitle =
    dropOverlay?.subtitle ?? "Release to open the uploader.";

  const nestedStorageDrop =
    subtitle.startsWith("Storage Drive:") || title.includes("Storage folder");

  const cloudFill: string = nestedStorageDrop
    ? isDark
      ? `rgba(${accentRgb},0.14)`
      : "rgba(255,255,255,0.72)"
    : isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(255,255,255,0.55)";

  const cloudStroke: string = nestedStorageDrop
    ? isDark
      ? `rgba(${accentRgb},0.88)`
      : `rgba(${accentRgb},0.65)`
    : isDark
      ? "rgba(255,255,255,0.5)"
      : `rgba(${accentRgb},0.4)`;

  const cloudShellFilter: string = nestedStorageDrop
    ? isDark
      ? `drop-shadow(0 0 0.5px rgba(${accentRgb},0.35)) drop-shadow(0 24px 48px rgba(0,0,0,0.52))`
      : `drop-shadow(0 0 0.5px rgba(${accentRgb},0.22)) drop-shadow(0 20px 40px rgba(15,23,42,0.12))`
    : isDark
      ? `drop-shadow(0 0 0.5px rgba(${accentRgb},0.2))`
      : `drop-shadow(0 0 0.5px rgba(${accentRgb},0.12))`;

  const titleClass = nestedStorageDrop
    ? isDark
      ? "text-white"
      : "text-neutral-900"
    : isDark
      ? "text-white"
      : "text-neutral-900";

  const subtitleClass = nestedStorageDrop
    ? isDark
      ? "text-white/90"
      : "text-neutral-700"
    : isDark
      ? "text-white/85"
      : "text-neutral-600";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={immersiveDropBackdropStyle}
      aria-hidden
    >
      <div
        className="relative mx-4 w-[min(92vw,26.5rem)]"
        style={{ filter: cloudShellFilter }}
      >
        <svg
          viewBox="0 0 24 24"
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <path d={DROP_OVERLAY_CLOUD_D} fill={cloudFill} />
          <path
            d={DROP_OVERLAY_CLOUD_D}
            fill="none"
            stroke={cloudStroke}
            strokeWidth={0.22}
            strokeDasharray="1.15 0.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 py-8 text-center sm:gap-5 sm:px-10 sm:py-10">
          <Upload
            className={`h-14 w-14 shrink-0 sm:h-16 sm:w-16 ${titleClass}`}
            strokeWidth={1.5}
          />
          <p
            className={`max-w-[16rem] text-center text-xl font-bold tracking-tight sm:max-w-md sm:text-2xl ${titleClass}`}
          >
            {title}
          </p>
          <p
            className={`max-w-[16rem] text-center text-base font-semibold leading-snug sm:max-w-md sm:text-lg ${subtitleClass}`}
          >
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
