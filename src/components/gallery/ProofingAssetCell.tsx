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
  fitProofingPreviewToMaxBounds,
  getProofingHoverVerticalClampRange,
  getProofingTableHoverPreviewPlacement,
  getProofingHoverPreviewSize,
  PROOFING_HOVER_VIEWPORT_MARGIN,
} from "@/lib/proofing-hover-preview-placement";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

const HOVER_HIDE_DELAY_MS = 350;
const HOVER_PREVIEW_GAP_PX = 12;
/** Keeps the popup’s right edge inside the asset column gutter (before Favorited). */
const HOVER_PREVIEW_CELL_RIGHT_INSET_PX = 14;
/** Keep in sync with `proofing-popup` duration in globals.css */
const PROOFING_POPUP_ANIMATION_MS = 200;

const POPUP_IMAGE_SHADOW =
  "0 20px 42px -14px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)";

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
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [popupPointerEvents, setPopupPointerEvents] = useState(false);
  const thumbRef = useRef<HTMLDivElement>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
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
    if (!isHovered || !previewUrl || rawPreviewUnavailable || (!isImage && !isVideo)) {
      setNaturalSize(null);
      return;
    }
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) setNaturalSize({ w, h });
      else setNaturalSize(null);
    };
    img.onerror = () => {
      if (!cancelled) setNaturalSize(null);
    };
    img.src = previewUrl;
    return () => {
      cancelled = true;
    };
  }, [isHovered, previewUrl, rawPreviewUnavailable, isImage, isVideo]);

  useEffect(() => {
    if (!isHovered || !thumbRef.current || !cellRef.current) {
      setPlacement(null);
      return;
    }
    const updatePos = () => {
      const thumbEl = thumbRef.current;
      const cellEl = cellRef.current;
      if (!thumbEl || !cellEl) return;
      const thumbRect = thumbEl.getBoundingClientRect();
      const cellRect = cellEl.getBoundingClientRect();
      const vv = window.visualViewport;
      const layoutVw = window.innerWidth;
      const vwFit = vv?.width ?? layoutVw;
      const vhFit = vv?.height ?? window.innerHeight;
      const maxBox = getProofingHoverPreviewSize(vwFit, vhFit);
      let width = maxBox.width;
      let height = maxBox.height;
      if (naturalSize) {
        const fitted = fitProofingPreviewToMaxBounds(
          naturalSize.w,
          naturalSize.h,
          maxBox.width,
          maxBox.height
        );
        width = fitted.width;
        height = fitted.height;
      }
      let { minY, maxY } = getProofingHoverVerticalClampRange(height);
      if (maxY < minY) {
        const availH = Math.max(48, vhFit - 2 * PROOFING_HOVER_VIEWPORT_MARGIN);
        const s = availH / height;
        height = Math.max(1, Math.floor(height * s));
        width = Math.max(1, Math.floor(width * s));
        ({ minY, maxY } = getProofingHoverVerticalClampRange(height));
      }
      const { left, top: topGuess } = getProofingTableHoverPreviewPlacement(
        thumbRect,
        cellRect,
        width,
        height,
        layoutVw,
        HOVER_PREVIEW_GAP_PX,
        HOVER_PREVIEW_CELL_RIGHT_INSET_PX
      );
      const top =
        maxY >= minY ? Math.max(minY, Math.min(topGuess, maxY)) : minY;
      setPlacement({ left, top, width, height });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", updatePos);
      vv.addEventListener("scroll", updatePos);
    }
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
      if (vv) {
        vv.removeEventListener("resize", updatePos);
        vv.removeEventListener("scroll", updatePos);
      }
    };
  }, [isHovered, naturalSize]);

  const imageChromeClass =
    "h-full w-full overflow-hidden rounded-xl [box-shadow:var(--proofing-pop-shadow)]";

  const popup =
    isHovered &&
    (isImage || isVideo) &&
    placement &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed z-[100]"
        style={
          {
            left: placement.left,
            top: placement.top,
            width: placement.width,
            height: placement.height,
            pointerEvents: popupPointerEvents ? "auto" : "none",
            "--proofing-pop-shadow": POPUP_IMAGE_SHADOW,
          } as React.CSSProperties
        }
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleHide}
      >
        {rawPreviewUnavailable && isImage ? (
          <div
            className="h-full w-full overflow-hidden rounded-xl p-2 [box-shadow:var(--proofing-pop-shadow)] backdrop-blur-md dark:bg-neutral-950/85 bg-white/90"
            style={{ animation: "proofing-popup 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            onAnimationEnd={handlePopupShellAnimationEnd}
          >
            <RawPreviewPlaceholder fileName={asset.name} className="min-h-0 text-[9px]" />
          </div>
        ) : showLutPopup ? (
          <div
            className={imageChromeClass}
            style={{ animation: "proofing-popup 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            onAnimationEnd={handlePopupShellAnimationEnd}
          >
            <ImageWithLUT
              imageUrl={previewUrl}
              lutUrl={previewLutSource}
              lutEnabled
              className="h-full w-full bg-transparent"
              objectFit="contain"
              tileLayout="grid"
              gradeMixPercent={lutGradeMixPercent}
            />
          </div>
        ) : previewUrl ? (
          <div
            className={imageChromeClass}
            style={{ animation: "proofing-popup 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            onAnimationEnd={handlePopupShellAnimationEnd}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="block h-full w-full object-contain bg-transparent" />
          </div>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl [box-shadow:var(--proofing-pop-shadow)]"
            style={{ animation: "proofing-popup 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            onAnimationEnd={handlePopupShellAnimationEnd}
          >
            {isVideo ? (
              <Film className="h-12 w-12 text-neutral-400 dark:text-neutral-500" />
            ) : (
              <Loader2 className="h-10 w-10 animate-spin text-neutral-400 dark:text-neutral-500" />
            )}
          </div>
        )}
      </div>,
      document.body
    );

  return (
    <td ref={cellRef} className="px-4 py-3">
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
