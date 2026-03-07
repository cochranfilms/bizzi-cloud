/**
 * Limits concurrent video thumbnail API requests to avoid overwhelming
 * Vercel serverless functions (which can return 503 under load).
 */
const MAX_CONCURRENT = 4;
const queue: Array<() => void> = [];
let active = 0;

function runNext() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  active++;
  const next = queue.shift()!;
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
        active--;
        runNext();
      }
    };
    queue.push(run);
    runNext();
  });
}
