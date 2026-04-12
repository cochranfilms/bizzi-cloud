/** Fired after a user replaces the grid video poster so thumbnails refetch without a full page reload. */
export const VIDEO_THUMB_BUST_EVENT = "bizzi-video-thumb-bust";

export type VideoThumbBustDetail = { objectKey: string };

export function dispatchVideoThumbnailBust(objectKey: string): void {
  if (typeof window === "undefined" || !objectKey.trim()) return;
  window.dispatchEvent(
    new CustomEvent<VideoThumbBustDetail>(VIDEO_THUMB_BUST_EVENT, {
      detail: { objectKey: objectKey.trim() },
    }),
  );
}
