"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Film, Loader2 } from "lucide-react";
import GalleryAssetThumbnail from "@/components/gallery/GalleryAssetThumbnail";
import ImageWithLUT from "@/components/gallery/ImageWithLUT";
import RawPreviewPlaceholder from "@/components/gallery/RawPreviewPlaceholder";
import { useGalleryThumbnail } from "@/hooks/useGalleryThumbnail";
import { resolveProofingGridLutMirror } from "@/lib/gallery-viewer-lut-state";
import { isRawFile } from "@/lib/gallery-file-types";
import {
  getHoverPreviewPlacement,
  getProofingHoverPreviewSize,
} from "@/lib/proofing-hover-preview-placement";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

const HOVER_HIDE_DELAY_MS = 350;
const HOVER_PREVIEW_GAP_PX = 12;
/** Keep in sync with `proofing-popup` duration in globals.css */
const PROOFING_POPUP_ANIMATION_MS = 200;

export interface ProofingAssetCellAsset {
  id: string;
  name: string;
  object_key?: string;
  media_type?: "image" | "video";
}

export function ProofingAssetCell({
  galleryId,
  asset,
  lutMirror,
}: {
  galleryId: string;
  asset: ProofingAssetCellAsset;
  lutMirror: ReturnType<typeof resolveProofingGridLutMirror>;
}) {
  const { previewLutSource, lutWorkflowActive, lutGradeMixPercent } = lutMirror;
  const [isHovered, setIsHovered] = useState(false);
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [popupPointerEvents, setPopupPointerEvents] = useState(false);
  const thumbRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(isHovered);

  const objectKey = asset.object_key ?? "";
  const isImage = IMAGE_EXT.test(asset.name);
  const isVideo = VIDEO_EXT.test(asset.name);
  const { url: previewUrl, rawPreviewUnavailable } = useGalleryThumbnail(
    galleryId,
    objectKey,
    asset.name,
    {
      enabled: (isImage || isVideo) && isHovered,
      size: "medium",
    }
  );

  const showLutPopup =
    isImage &&
    !!previewUrl &&
    !rawPreviewUnavailable &&
    lutWorkflowActive &&
    !!previewLutSource &&
    isRawFile(asset.name);

  isHoveredRef.current = isHovered;

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const clearAnimationFallback = () => {
    if (animationFallbackRef.current) {
      clearTimeout(animationFallbackRef.current);
      animationFallbackRef.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => setIsHovered(false), HOVER_HIDE_DELAY_MS);
  };

  const handleMouseEnter = () => {
    clearHideTimeout();
    setIsHovered(true);
  };

  const handlePopupShellAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.animationName !== "proofing-popup") return;
    if (isHoveredRef.current) {
      setPopupPointerEvents(true);
      clearAnimationFallback();
    }
  }, []);

  useEffect(() => {
    return () => {
      clearHideTimeout();
      clearAnimationFallback();
    };
  }, []);

  useEffect(() => {
    clearAnimationFallback();
    setPopupPointerEvents(false);
    if (!isHovered) return;
    animationFallbackRef.current = setTimeout(() => {
      if (isHoveredRef.current) setPopupPointerEvents(true);
    }, PROOFING_POPUP_ANIMATION_MS);
  }, [isHovered]);

  useEffect(() => {
    if (!isHovered || !thumbRef.current) {
      setPlacement(null);
      return;
    }
    const updatePos = () => {
      const el = thumbRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const { width, height } = getProofingHoverPreviewSize(vw, vh);
      const { left, top } = getHoverPreviewPlacement(
        rect,
        width,
        height,
        vw,
        vh,
        HOVER_PREVIEW_GAP_PX
      );
      setPlacement({ left, top, width, height });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [isHovered]);

  const popup =
    isHovered &&
    (isImage || isVideo) &&
    placement &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed z-[100]"
        style={{
          left: placement.left,
          top: placement.top,
          width: placement.width,
          height: placement.height,
          pointerEvents: popupPointerEvents ? "auto" : "none",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleHide}
      >
        <div
          className="h-full w-full overflow-hidden rounded-xl border-2 border-white bg-neutral-900 shadow-2xl shadow-black/25 ring-2 ring-neutral-500/30"
          style={{ animation: "proofing-popup 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
          onAnimationEnd={handlePopupShellAnimationEnd}
        >
          {rawPreviewUnavailable && isImage ? (
            <div className="h-full overflow-y-auto p-1">
              <RawPreviewPlaceholder fileName={asset.name} className="min-h-0 text-[9px]" />
            </div>
          ) : showLutPopup ? (
            <ImageWithLUT
              imageUrl={previewUrl}
              lutUrl={previewLutSource}
              lutEnabled
              className="h-full w-full"
              objectFit="contain"
              tileLayout="grid"
              gradeMixPercent={lutGradeMixPercent}
            />
          ) : previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-800">
              {isVideo ? (
                <Film className="h-12 w-12 text-neutral-500" />
              ) : (
                <Loader2 className="h-10 w-10 animate-spin text-neutral-500" />
              )}
            </div>
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <td className="px-4 py-3">
      <div
        className="flex items-center gap-3"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleHide}
      >
        <div ref={thumbRef} className="h-10 w-10 shrink-0 overflow-hidden rounded">
          <GalleryAssetThumbnail
            galleryId={galleryId}
            objectKey={objectKey}
            name={asset.name}
            mediaType={asset.media_type ?? "image"}
            className="h-10 w-10"
            enabled
            lutWorkflowActive={lutWorkflowActive}
            previewLutSource={previewLutSource}
            lutGradeMixPercent={lutGradeMixPercent}
          />
        </div>
        <span className="truncate font-mono text-xs text-neutral-600 dark:text-neutral-400">
          {asset.name}
        </span>
      </div>
      {popup}
    </td>
  );
}
