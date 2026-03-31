/**
 * Serialize /api/uppy/presigned-complete calls so many small FCP bundle files don't
 * open dozens of concurrent connections (Chrome net::ERR_INSUFFICIENT_RESOURCES).
 *
 * Returns the same promise as the enqueued work so callers can await and surface errors.
 */
let chain: Promise<void> = Promise.resolve();

export function enqueuePresignedComplete(run: () => Promise<void>): Promise<void> {
  const next = chain.then(() => run());
  chain = next.catch(() => {});
  return next;
}
