#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

/** Stable exit codes (see README). */
constexpr int EX_USAGE = 2;
constexpr int EX_SDK_INIT = 3;
constexpr int EX_CLIP = 4;
constexpr int EX_DECODE = 5;
constexpr int EX_FFMPEG_SPAWN = 6;
constexpr int EX_FFMPEG_EXIT = 7;
constexpr int EX_OUTPUT = 8;

struct BrawDecodeConfig {
  /** Target width in pixels (used to pick SDK scale + FFmpeg scale=W:-2). <= 0 disables target-based scaling (full decode width). */
  int target_width = 1280;
  /** Cap frames for debugging; <= 0 means full clip. */
  int max_frames = 0;
  /**
   * Seconds to wait for ProcessComplete handoff after each read Submit+Flush.
   * <= 0 means effectively unbounded (24h cap inside implementation for safety).
   */
  int handoff_timeout_sec = 120;
  /** Verbose stderr trace (consumer wake, dequeue, frame index, etc.). */
  bool debug_trace = false;
  /**
   * Temporary crash-isolation experiment: publish success from ProcessComplete, but defer COM Release of the
   * process job / processed image to the main thread safe point in take_completed_frame().
   */
  bool defer_success_release_to_main = false;
  /**
   * ProcessComplete success-path bisect (immediate callback-thread COM release except mode 0 may use defer flag):
   * 0 = normal production path (respect defer_success_release_to_main).
   * 1 = flush unwind probe: no copy/publish/notify, immediate COM release (was --flush-unwind-probe).
   * 2 = copy SDK→owned buffer only, then immediate COM release (no publish/notify).
   * 3 = copy + publish pending_ under lock (valid/frame_ready) but no cv notify, then immediate COM release.
   * 4 = copy + publish + notify_all + immediate COM release (ignores defer_success_release_to_main).
   * 5..10 = cumulative publish-under-lock bisect (no notify_all; same timing as 3). Each adds the next mutation:
   *   5 = clear deferred_process_* only
   *   6 = + reset pending_ + move pixels
   *   7 = + w, h, row_bytes
   *   8 = + pending_.valid = true
   *   9 = + last_hr_ = S_OK
   *  10 = + frame_ready_ = true (equivalent publish body to mode 3)
   *  11 = same publish as 9 in first lock, then COM Release, then frame_ready_=true (readiness after SDK objects freed).
   *  12 = same as 11 but frame_ready_=true in a 2nd lock before COM Release (readiness while SDK objects still alive).
   */
  int process_complete_experiment = 0;
};

struct ClipMeta {
  uint32_t clip_width = 0;
  uint32_t clip_height = 0;
  uint64_t frame_count = 0;
  /** Exact frames per second; must be valid (> 0, finite) or probe fails. */
  double fps = 0.0;
  /** If non-zero, pass numerator/denominator to FFmpeg -framerate for exact timing. */
  uint32_t fps_num = 0;
  uint32_t fps_den = 0;
};

/**
 * Predict decoded frame dimensions after SDK resolution scale for a target proxy width.
 * Uses the same scale selection as braw_decode_frames (integer rounding matches common BMD behavior).
 */
void braw_dimensions_for_target_width(uint32_t clip_w, uint32_t clip_h, int target_width, uint32_t& out_w,
  uint32_t& out_h);

/**
 * Open clip and read dimensions, frame count, and frame rate.
 * @return 0 on success, EX_CLIP on failure (incl. invalid/missing FPS).
 */
int braw_probe_clip(const std::string& input_path, ClipMeta& meta);

/**
 * Decode frame 0 only and return the processed RGBA8 width/height from the SDK.
 * Used so FFmpeg -video_size matches the actual decoded plane (prediction can differ).
 * @return 0 on success, EX_DECODE / same as braw_decode_frames on failure.
 */
int braw_probe_decoded_frame0_size(const std::string& input_path, const BrawDecodeConfig& cfg, const ClipMeta& meta,
  uint32_t& out_w, uint32_t& out_h);

/**
 * Decode clip to CPU-processed RGBA8 and invoke on_frame for each frame in order.
 * Re-opens the clip internally. Use metadata from braw_probe_clip.
 * @return 0 on success, EX_SDK_INIT / EX_CLIP / EX_DECODE on failure.
 */
int braw_decode_frames(const std::string& input_path, const BrawDecodeConfig& cfg, const ClipMeta& meta,
  const std::function<bool(const uint8_t* pixels, uint32_t row_bytes, uint32_t w, uint32_t h, uint64_t frame_index)>&
    on_frame);
