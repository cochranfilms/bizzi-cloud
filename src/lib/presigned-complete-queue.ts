/**
 * Serialize /api/uppy/presigned-complete calls so many small FCP bundle files don't
 * open dozens of concurrent connections (Chrome net::ERR_INSUFFICIENT_RESOURCES).
 */
let chain = Promise.resolve();

export function enqueuePresignedComplete(run: () => Promise<void>): void {
  chain = chain.then(run).catch(() => {});
}
