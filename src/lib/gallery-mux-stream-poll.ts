import {
  isGalleryVideoStreamSuccess,
  isMuxHlsSource,
  type GalleryVideoStreamSuccessBody,
} from "@/lib/gallery-video-stream-response";

/** Backoff before each poll attempt (not including the initial page load fetch). */
export const GALLERY_MUX_POLL_DELAYS_MS = [3000, 5000, 8000, 10000] as const;

export const GALLERY_MUX_POLL_MAX_ATTEMPTS = 15;
export const GALLERY_MUX_POLL_CONSECUTIVE_ERROR_STOP = 3;

export function getGalleryMuxPollDelayMs(pollIndex: number): number {
  const i = Math.min(pollIndex, GALLERY_MUX_POLL_DELAYS_MS.length - 1);
  return GALLERY_MUX_POLL_DELAYS_MS[i];
}

export type GalleryMuxPollTerminalReason =
  | "mux_hls"
  | "max_attempts"
  | "no_upgrade_path"
  | "cancelled"
  | "consecutive_errors";

export interface StartGalleryMuxStreamUpgradePollOptions {
  fetchOnce: () => Promise<Response>;
  shouldContinue: () => boolean;
  onMuxHls: (body: GalleryVideoStreamSuccessBody) => void;
  onTerminal: (reason: GalleryMuxPollTerminalReason) => void;
  maxAttempts?: number;
  consecutiveErrorStop?: number;
}

export interface GalleryMuxPollHandle {
  cancel: () => void;
}

/**
 * Schedules retries with modest backoff until mux_hls, give-up conditions, or cancel().
 * Caller runs initial fetch; call only when shouldStartMuxStreamUpgradePoll(initialBody).
 */
export function startGalleryMuxStreamUpgradePoll(
  options: StartGalleryMuxStreamUpgradePollOptions
): GalleryMuxPollHandle {
  const maxAttempts = options.maxAttempts ?? GALLERY_MUX_POLL_MAX_ATTEMPTS;
  const errorStop = options.consecutiveErrorStop ?? GALLERY_MUX_POLL_CONSECUTIVE_ERROR_STOP;
  let cancelled = false;
  /** Next delay uses this index (0 = 3s before first poll fetch). */
  let pollIndex = 0;
  let consecutiveErrors = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const finish = (reason: GalleryMuxPollTerminalReason) => {
    clearTimer();
    options.onTerminal(reason);
  };

  const scheduleNext = () => {
    if (cancelled) {
      finish("cancelled");
      return;
    }
    if (!options.shouldContinue()) {
      finish("cancelled");
      return;
    }
    if (pollIndex >= maxAttempts) {
      finish("max_attempts");
      return;
    }
    const delay = getGalleryMuxPollDelayMs(pollIndex);
    pollIndex += 1;
    timeoutId = setTimeout(runFetch, delay);
  };

  const runFetch = () => {
    timeoutId = null;
    if (cancelled || !options.shouldContinue()) {
      finish("cancelled");
      return;
    }
    void (async () => {
      try {
        const res = await options.fetchOnce();
        if (cancelled || !options.shouldContinue()) {
          finish("cancelled");
          return;
        }
        if (!res.ok) {
          consecutiveErrors += 1;
          if (consecutiveErrors >= errorStop) {
            finish("consecutive_errors");
            return;
          }
          scheduleNext();
          return;
        }
        consecutiveErrors = 0;
        const raw = await res.json().catch(() => null);
        if (cancelled || !options.shouldContinue()) {
          finish("cancelled");
          return;
        }
        if (!isGalleryVideoStreamSuccess(raw)) {
          finish("no_upgrade_path");
          return;
        }
        if (isMuxHlsSource(raw)) {
          options.onMuxHls(raw);
          finish("mux_hls");
          return;
        }
        if (raw.muxPlaybackPending === false) {
          finish("no_upgrade_path");
          return;
        }
        scheduleNext();
      } catch {
        if (cancelled || !options.shouldContinue()) {
          finish("cancelled");
          return;
        }
        consecutiveErrors += 1;
        if (consecutiveErrors >= errorStop) {
          finish("consecutive_errors");
          return;
        }
        scheduleNext();
      }
    })();
  };

  scheduleNext();

  return {
    cancel: () => {
      cancelled = true;
      clearTimer();
    },
  };
}
