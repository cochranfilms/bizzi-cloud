/**
 * hls.js setup for public gallery video (hero, tiles, modal).
 *
 * Mux (and similar) ABR often starts on a tiny rung; short muted loops may never
 * step up before seek-to-zero, so the WebGL LUT path samples a blocky frame.
 * `preferMaxQuality` defers the first fragment load until we pick the top ladder rung.
 */
import Hls from "hls.js";

export function createGalleryHlsInstance(opts: {
  preferMaxQuality: boolean;
  /** maxMaxBufferLength when not forcing top rung */
  maxBufferDefault: number;
  /** maxMaxBufferLength when forcing top rung (need headroom for big segments) */
  maxBufferTopRung: number;
}): Hls {
  const { preferMaxQuality, maxBufferDefault, maxBufferTopRung } = opts;

  if (!preferMaxQuality) {
    return new Hls({
      maxMaxBufferLength: maxBufferDefault,
      startLevel: -1,
    });
  }

  const hls = new Hls({
    autoStartLoad: false,
    capLevelToPlayerSize: false,
    maxMaxBufferLength: maxBufferTopRung,
    startLevel: -1,
  });

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    const n = hls.levels?.length ?? 0;
    if (n > 0) {
      hls.autoLevelCapping = -1;
      const top = n - 1;
      hls.startLevel = top;
      hls.currentLevel = top;
    }
    hls.startLoad(-1);
  });

  return hls;
}
