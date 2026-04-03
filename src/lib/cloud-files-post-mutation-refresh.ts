/**
 * One debounced post-mutation refresh for the whole app. Multiple `useCloudFiles` instances
 * used to each schedule their own full refetch; only the subscriber registers the work here.
 */
const DEBOUNCE_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
type RefreshFn = () => void;
let registeredRefresh: RefreshFn | null = null;

export function registerCloudFilesPostMutationRefresh(fn: RefreshFn): () => void {
  registeredRefresh = fn;
  return () => {
    if (registeredRefresh === fn) registeredRefresh = null;
  };
}

export function scheduleCloudFilesPostMutationRefresh(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      registeredRefresh?.();
    } catch {
      // ignore
    }
  }, DEBOUNCE_MS);
}
