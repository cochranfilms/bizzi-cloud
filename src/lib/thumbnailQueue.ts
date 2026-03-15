/**
 * Limits concurrent thumbnail API requests to avoid overwhelming
 * serverless functions and prevent ERR_INSUFFICIENT_RESOURCES in the browser.
 */
const VIDEO_MAX_CONCURRENT = 4;
const IMAGE_MAX_CONCURRENT = 8;

const videoQueue: Array<() => void> = [];
let videoActive = 0;

const imageQueue: Array<() => void> = [];
let imageActive = 0;

function runVideoNext() {
  if (videoActive >= VIDEO_MAX_CONCURRENT || videoQueue.length === 0) return;
  videoActive++;
  const next = videoQueue.shift()!;
  next();
}

function runImageNext() {
  if (imageActive >= IMAGE_MAX_CONCURRENT || imageQueue.length === 0) return;
  imageActive++;
  const next = imageQueue.shift()!;
  next();
}

export function withThumbnailSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        videoActive--;
        runVideoNext();
      }
    };
    videoQueue.push(run);
    runVideoNext();
  });
}

/** Limits concurrent image thumbnail fetches. Use in useShareThumbnail. */
export function withImageThumbnailSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        imageActive--;
        runImageNext();
      }
    };
    imageQueue.push(run);
    runImageNext();
  });
}
