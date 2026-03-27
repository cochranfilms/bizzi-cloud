/**
 * Client-side previews for Uppy Dashboard (images, RAW stills where the browser can decode, video poster frame).
 */
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT, isRawFile } from "@/lib/gallery-file-types";

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

function probeRasterObjectUrl(objectUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(ok);
    };
    const timeout = window.setTimeout(() => done(false), 4000);
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => done(false);
    img.src = objectUrl;
  });
}

function createRasterPlaceholderPreview(label: string): Promise<string | null> {
  return new Promise((resolve) => {
    const w = 240;
    const h = 160;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#1e293b");
    grd.addColorStop(1, "#0f172a");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(148, 163, 184, 0.92)";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RAW — thumbnail after upload", w / 2, h / 2 - 6);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(148, 163, 184, 0.78)";
    const base = label.includes("/") ? label.slice(label.lastIndexOf("/") + 1) : label;
    ctx.fillText(base.length > 32 ? `${base.slice(0, 30)}…` : base, w / 2, h / 2 + 12);
    canvas.toBlob(
      (blob) => {
        resolve(blob ? URL.createObjectURL(blob) : null);
      },
      "image/png",
      0.92
    );
  });
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
    if (isRawFile(name)) {
      const url = URL.createObjectURL(fileData);
      const decodes = await probeRasterObjectUrl(url);
      if (!decodes) {
        URL.revokeObjectURL(url);
        const ph = await createRasterPlaceholderPreview(name);
        if (ph) setPreview(ph);
        return;
      }
      setPreview(url);
      return;
    }
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
