/**
 * Limits concurrent /api/files/.../hearts requests so large grids do not exhaust browser sockets
 * (net::ERR_INSUFFICIENT_RESOURCES).
 */
const MAX_CONCURRENT = 8;
const queue: Array<() => void> = [];
let active = 0;

function runNext() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  active++;
  const next = queue.shift()!;
  next();
}

export function withHeartRequestSlot<T>(fn: () => Promise<T>): Promise<T | undefined> {
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
