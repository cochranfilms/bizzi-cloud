/**
 * Client-side previews for Uppy Dashboard (images, RAW stills where the browser can decode, video poster frame).
 */
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";

export function isUppyPreviewableImageName(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name.toLowerCase());
}

export function isUppyPreviewableVideoName(name: string): boolean {
  return GALLERY_VIDEO_EXT.test(name.toLowerCase());
}

/**
 * Best relative path for storage keys: preserve folder structure (e.g. Final Cut .fcpbundle).
 */
export function getUploadRelativePath(
  fileData: File | Blob | null,
  displayName: string
): string {
  if (fileData instanceof File) {
    const wr = fileData.webkitRelativePath?.trim();
    if (wr) return wr.replace(/^\/+/, "");
  }
  return displayName;
}

function revokeIfBlobUrl(url: string | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

/**
 * Set `preview` on Uppy file state for Dashboard thumbnails.
 */
export async function attachUppyLocalPreview(
  setPreview: (preview: string) => void,
  fileData: File
): Promise<void> {
  const name = fileData.name;

  if (fileData.type.startsWith("image/") || isUppyPreviewableImageName(name)) {
    const url = URL.createObjectURL(fileData);
    setPreview(url);
    return;
  }

  if (fileData.type.startsWith("video/") || isUppyPreviewableVideoName(name)) {
    const poster = await extractVideoPosterFrame(fileData);
    if (poster) setPreview(poster);
  }
}

function extractVideoPosterFrame(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const done = (result: string | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timeout = window.setTimeout(() => done(null), 20_000);

    video.onloadedmetadata = () => {
      try {
        const dur = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = dur > 0 ? Math.min(0.05, dur * 0.02) : 0.05;
      } catch {
        clearTimeout(timeout);
        done(null);
      }
    };

    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          clearTimeout(timeout);
          done(null);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          clearTimeout(timeout);
          done(null);
          return;
        }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout);
            done(blob ? URL.createObjectURL(blob) : null);
          },
          "image/jpeg",
          0.82
        );
      } catch {
        clearTimeout(timeout);
        done(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      done(null);
    };

    video.src = url;
  });
}

export function revokeUppyPreview(preview: string | undefined): void {
  revokeIfBlobUrl(preview);
}
