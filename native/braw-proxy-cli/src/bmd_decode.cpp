#include "bmd_decode.hpp"

#include <BlackmagicRawAPI.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <limits>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

template <typename T>
static void safe_release(T*& p) {
  if (p) {
    p->Release();
    p = nullptr;
  }
}

static bool braw_iid_eq(REFIID a, REFIID b) {
  return std::memcmp(&a, &b, sizeof(REFIID)) == 0;
}

static bool fps_valid(double fps) {
  return std::isfinite(fps) && fps > 1e-6 && fps < 1e6;
}

static size_t braw_trace_tid_hash() {
  return std::hash<std::thread::id>{}(std::this_thread::get_id());
}

/**
 * Fallback when ProcessComplete has no DecodeCallback* to work with: release in-callback (rare E_POINTER path).
 * Normal success-path release strategy is selected inside DecodeCallback::ProcessComplete().
 */
static void sdk_release_after_process_complete(IBlackmagicRawProcessedImage*& rel_img, IBlackmagicRawJob*& rel_job) {
  std::fprintf(stderr,
    "[ffmpeg-braw trace] ProcessComplete: epilog — releasing processedImage/job if non-null (img=%p job=%p "
    "tid=%zu)\n",
    static_cast<void*>(rel_img), static_cast<void*>(rel_job), braw_trace_tid_hash());
  std::fflush(stderr);
  if (rel_img != nullptr) {
    rel_img->Release();
    rel_img = nullptr;
    std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: processedImage->Release done (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
  } else {
    std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: processedImage was null — no Release (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  if (rel_job != nullptr) {
    rel_job->Release();
    rel_job = nullptr;
    std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: job->Release done (tid=%zu)\n", braw_trace_tid_hash());
    std::fflush(stderr);
  } else {
    std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: job was null — no Release (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: returning to Blackmagic SDK runtime (tid=%zu)\n",
    braw_trace_tid_hash());
  std::fflush(stderr);
}

/**
 * COM Release for deferred IBlackmagicRawJob + IBlackmagicRawProcessedImage.
 * Call only with DecodeCallback::mu_ NOT held — SDK may recurse; avoids deadlock with worker threads.
 */
static void release_bmd_deferred_sdk_pair(IBlackmagicRawJob* job, IBlackmagicRawProcessedImage* img, const char* ctx) {
  if (img != nullptr) {
    std::fprintf(stderr, "[ffmpeg-braw trace] %s: processedImage->Release (ptr=%p tid=%zu)\n", ctx,
      static_cast<void*>(img), braw_trace_tid_hash());
    std::fflush(stderr);
    img->Release();
    std::fprintf(stderr, "[ffmpeg-braw trace] %s: processedImage Release finished (tid=%zu)\n", ctx, braw_trace_tid_hash());
    std::fflush(stderr);
  }
  if (job != nullptr) {
    std::fprintf(stderr, "[ffmpeg-braw trace] %s: job->Release (ptr=%p tid=%zu)\n", ctx, static_cast<void*>(job),
      braw_trace_tid_hash());
    std::fflush(stderr);
    job->Release();
    std::fprintf(stderr, "[ffmpeg-braw trace] %s: job Release finished (tid=%zu)\n", ctx, braw_trace_tid_hash());
    std::fflush(stderr);
  }
  std::fprintf(stderr, "[ffmpeg-braw trace] %s: deferred pair drain complete (tid=%zu)\n", ctx, braw_trace_tid_hash());
  std::fflush(stderr);
}

static constexpr uint64_t kUnknownFrameIndex = (std::numeric_limits<uint64_t>::max)();

class DecodeCallback;
static std::string frame_index_label(uint64_t frame_index);
static void release_deferred_callback_hold(DecodeCallback*& callback, uint64_t frame_index, const char* ctx);

struct DeferredSdkPairSlot {
  std::mutex mu;
  IBlackmagicRawJob* job = nullptr;
  IBlackmagicRawProcessedImage* img = nullptr;
  DecodeCallback* callback = nullptr;
  uint64_t frame_index = kUnknownFrameIndex;
};

static DeferredSdkPairSlot& deferred_sdk_pair_slot() {
  static DeferredSdkPairSlot slot;
  return slot;
}

static void store_external_deferred_sdk_pair(IBlackmagicRawJob* job, IBlackmagicRawProcessedImage* img,
  DecodeCallback* callback, uint64_t frame_index, const char* ctx) {
  auto& slot = deferred_sdk_pair_slot();
  std::lock_guard<std::mutex> lk(slot.mu);
  if (slot.job != nullptr || slot.img != nullptr || slot.callback != nullptr) {
    std::fprintf(stderr,
      "braw-proxy-cli: release: external deferred slot overwrite blocked ctx=%s old_frame=%llu old_job=%p "
      "old_img=%p old_cb=%p new_frame=%llu new_job=%p new_img=%p new_cb=%p tid=%zu\n",
      ctx != nullptr ? ctx : "(null)", static_cast<unsigned long long>(slot.frame_index), static_cast<void*>(slot.job),
      static_cast<void*>(slot.img), static_cast<void*>(slot.callback), static_cast<unsigned long long>(frame_index),
      static_cast<void*>(job), static_cast<void*>(img), static_cast<void*>(callback), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  slot.job = job;
  slot.img = img;
  slot.callback = callback;
  slot.frame_index = frame_index;
}

static void steal_external_deferred_sdk_pair(IBlackmagicRawJob*& job, IBlackmagicRawProcessedImage*& img,
  DecodeCallback*& callback, uint64_t& frame_index) {
  auto& slot = deferred_sdk_pair_slot();
  std::lock_guard<std::mutex> lk(slot.mu);
  job = slot.job;
  img = slot.img;
  callback = slot.callback;
  frame_index = slot.frame_index;
  slot.job = nullptr;
  slot.img = nullptr;
  slot.callback = nullptr;
  slot.frame_index = kUnknownFrameIndex;
}

static std::string frame_index_label(uint64_t frame_index) {
  return frame_index == kUnknownFrameIndex ? "unknown" : std::to_string(frame_index);
}

static void merge_external_deferred_sdk_pair(
  IBlackmagicRawJob*& job, IBlackmagicRawProcessedImage*& img, DecodeCallback*& callback, const char* ctx) {
  IBlackmagicRawJob* ext_job = nullptr;
  IBlackmagicRawProcessedImage* ext_img = nullptr;
  DecodeCallback* ext_callback = nullptr;
  uint64_t ext_frame = kUnknownFrameIndex;
  steal_external_deferred_sdk_pair(ext_job, ext_img, ext_callback, ext_frame);
  if (ext_job == nullptr && ext_img == nullptr && ext_callback == nullptr)
    return;
  if (job == nullptr && img == nullptr) {
    job = ext_job;
    img = ext_img;
    callback = ext_callback;
    return;
  }
  std::fprintf(stderr,
    "braw-proxy-cli: release: dual deferred pairs ctx=%s external_frame=%s local_job=%p local_img=%p local_cb=%p "
    "external_job=%p external_img=%p external_cb=%p tid=%zu\n",
    ctx != nullptr ? ctx : "(null)", frame_index_label(ext_frame).c_str(), static_cast<void*>(job),
    static_cast<void*>(img), static_cast<void*>(callback), static_cast<void*>(ext_job), static_cast<void*>(ext_img),
    static_cast<void*>(ext_callback), braw_trace_tid_hash());
  std::fflush(stderr);
  release_bmd_deferred_sdk_pair(ext_job, ext_img, "unexpected external deferred pair");
  release_deferred_callback_hold(ext_callback, ext_frame, "unexpected external deferred pair");
}

static void release_bmd_sdk_pair_logged(IBlackmagicRawJob* job, IBlackmagicRawProcessedImage* img, const char* ctx,
  uint64_t frame_index, uint64_t release_seq) {
  const std::string frame_label = frame_index_label(frame_index);
  std::fprintf(stderr,
    "braw-proxy-cli: release-item: create seq=%llu frame=%s job=%p img=%p ctx=%s tid=%zu\n",
    static_cast<unsigned long long>(release_seq), frame_label.c_str(), static_cast<void*>(job), static_cast<void*>(img),
    ctx != nullptr ? ctx : "(null)", braw_trace_tid_hash());
  std::fflush(stderr);
  std::fprintf(stderr,
    "braw-proxy-cli: release-item: consume seq=%llu frame=%s job=%p img=%p ctx=%s tid=%zu\n",
    static_cast<unsigned long long>(release_seq), frame_label.c_str(), static_cast<void*>(job), static_cast<void*>(img),
    ctx != nullptr ? ctx : "(null)", braw_trace_tid_hash());
  std::fflush(stderr);
  release_bmd_deferred_sdk_pair(job, img, ctx != nullptr ? ctx : "release-item");
  std::fprintf(stderr,
    "braw-proxy-cli: release-item: destroy seq=%llu frame=%s job=%p img=%p ctx=%s tid=%zu\n",
    static_cast<unsigned long long>(release_seq), frame_label.c_str(), static_cast<void*>(job), static_cast<void*>(img),
    ctx != nullptr ? ctx : "(null)", braw_trace_tid_hash());
  std::fflush(stderr);
}

template <typename T>
static IUnknown* query_iunknown_identity(T* obj) {
  if (obj == nullptr)
    return nullptr;
  IUnknown* unk = nullptr;
  const HRESULT hr = obj->QueryInterface(IID_IUnknown, reinterpret_cast<void**>(&unk));
  if (FAILED(hr)) {
    std::fprintf(stderr, "braw-proxy-cli: release: QueryInterface(IID_IUnknown) failed hr=0x%08x tid=%zu\n",
      static_cast<unsigned int>(hr), braw_trace_tid_hash());
    std::fflush(stderr);
    return nullptr;
  }
  return unk;
}

/** Same scaling idea as SDK samples (BlackmagicRawResolutionScale). */
static BlackmagicRawResolutionScale pick_resolution_scale(uint32_t clip_w, int target_w) {
  if (target_w <= 0 || clip_w == 0)
    return blackmagicRawResolutionScaleFull;
  if (clip_w <= static_cast<uint32_t>(target_w))
    return blackmagicRawResolutionScaleFull;
  unsigned div = 1;
  while (clip_w / (div * 2) >= static_cast<uint32_t>(target_w) && div < 8)
    div *= 2;
  if (div >= 8)
    return blackmagicRawResolutionScaleEighth;
  if (div >= 4)
    return blackmagicRawResolutionScaleQuarter;
  if (div >= 2)
    return blackmagicRawResolutionScaleHalf;
  return blackmagicRawResolutionScaleFull;
}

static void dimensions_for_scale(BlackmagicRawResolutionScale scale, uint32_t cw, uint32_t ch, uint32_t& dw,
  uint32_t& dh) {
  switch (scale) {
    case blackmagicRawResolutionScaleFull:
      dw = cw;
      dh = ch;
      break;
    case blackmagicRawResolutionScaleHalf:
      dw = std::max(1u, (cw + 1u) / 2u);
      dh = std::max(1u, (ch + 1u) / 2u);
      break;
    case blackmagicRawResolutionScaleQuarter:
      dw = std::max(1u, (cw + 3u) / 4u);
      dh = std::max(1u, (ch + 3u) / 4u);
      break;
    case blackmagicRawResolutionScaleEighth:
      dw = std::max(1u, (cw + 7u) / 8u);
      dh = std::max(1u, (ch + 7u) / 8u);
      break;
    default:
      dw = cw;
      dh = ch;
      break;
  }
}

void braw_dimensions_for_target_width(uint32_t clip_w, uint32_t clip_h, int target_width, uint32_t& out_w,
  uint32_t& out_h) {
  const BlackmagicRawResolutionScale s = pick_resolution_scale(clip_w, target_width);
  dimensions_for_scale(s, clip_w, clip_h, out_w, out_h);
}

/** Float frame rate only; derive a rational for FFmpeg when useful (BRAWconverter-style). */
static int read_timing(IBlackmagicRawClip* clip, ClipMeta& meta) {
  float fr = 0.F;
  const HRESULT hr = clip->GetFrameRate(&fr);
  if (FAILED(hr) || fr <= 0.F || !fps_valid(static_cast<double>(fr)))
    return EX_CLIP;
  meta.fps = static_cast<double>(fr);

  double fps_inte = 0.0;
  const double fps_frac = std::modf(static_cast<double>(fr), &fps_inte);
  if (fps_frac == 0.0) {
    meta.fps_num = static_cast<uint32_t>(fps_inte);
    meta.fps_den = 1;
  } else {
    const int d = 1001;
    meta.fps_num = static_cast<uint32_t>(static_cast<double>(fr) * static_cast<double>(d) + 0.5);
    meta.fps_den = static_cast<uint32_t>(d);
  }
  return 0;
}

/** Single-slot handoff: worker fills under mu_, main moves out before FFmpeg I/O. */
struct FrameHandoffPacket {
  std::vector<uint8_t> pixels;
  uint32_t w = 0;
  uint32_t h = 0;
  uint32_t row_bytes = 0;
  bool valid = false;
};

/**
 * Codec callback matching ProcessClipCPU: COM refcounting, ReadComplete → decode+process job,
 * ProcessComplete copies CPU RGBA8 while IBlackmagicRawProcessedImage is still alive.
 * Success path: copy pixels, publish pending, notify, then either release COM on the callback thread or defer that
 * release to the main-thread safe point in take_completed_frame() for crash isolation.
 * Keep per-frame bookkeeping minimal: this loop has exactly one frame in flight, so a single active frame index is
 * safer than tagging SDK jobs and tracking them in a map.
 */
class DecodeCallback final : public IBlackmagicRawCallback {
 public:
  BlackmagicRawResolutionScale scale = blackmagicRawResolutionScaleFull;
  IBlackmagicRawClipProcessingAttributes* clip_attrs = nullptr;

  void ReadComplete(IBlackmagicRawJob* readJob, HRESULT result, IBlackmagicRawFrame* frame) override;
  void ProcessComplete(IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage) override;
  void DecodeComplete(IBlackmagicRawJob* job, HRESULT result) override;
  void TrimProgress(IBlackmagicRawJob*, float) override {}
  void TrimComplete(IBlackmagicRawJob*, HRESULT) override {}
  void SidecarMetadataParseWarning(IBlackmagicRawClip*, const char*, uint32_t, const char*) override {}
  void SidecarMetadataParseError(IBlackmagicRawClip*, const char*, uint32_t, const char*) override {}
  void PreparePipelineComplete(void*, HRESULT) override {}

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (ppv == nullptr)
      return E_POINTER;
    *ppv = nullptr;
    if (braw_iid_eq(riid, IID_IBlackmagicRawCallback)) {
      *ppv = static_cast<IBlackmagicRawCallback*>(this);
      AddRef();
      return S_OK;
    }
    return E_NOINTERFACE;
  }

  ULONG STDMETHODCALLTYPE AddRef() override { return ref_count_.fetch_add(1, std::memory_order_relaxed) + 1; }

  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG prev = ref_count_.fetch_sub(1, std::memory_order_acq_rel);
    const ULONG now = prev - 1;
    if (now == 0)
      delete this;
    return now;
  }

  void reset_wait();

  void set_handoff_timeout_sec(int sec) { handoff_timeout_sec_ = sec; }
  void set_debug_trace(bool on) { debug_trace_ = on; }
  void set_defer_success_release_to_main(bool on) { defer_success_release_to_main_ = on; }
  void set_flush_unwind_probe(bool on) { flush_unwind_probe_ = on; }

  bool wait_processed(uint64_t frame_index);

  /**
   * After successful wait_processed(), move the completed frame out of the callback under mu_.
   * Caller writes to FFmpeg after this returns (no callback locks held).
   */
  bool take_completed_frame(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w, uint32_t& h,
    uint64_t frame_index);

  /** If wait_processed() fails, still release any job/img ProcessComplete deferred (main thread). */
  void release_deferred_process_sdk_main();
  void set_active_frame_index(uint64_t frame_index);
  uint64_t take_active_frame_index();

 private:
  uint64_t next_release_seq();

  std::atomic<ULONG> ref_count_{1};
  std::mutex mu_;
  std::condition_variable cv_;
  bool frame_ready_ = false;
  HRESULT last_hr_ = S_OK;
  FrameHandoffPacket pending_{};
  IBlackmagicRawJob* deferred_process_job_ = nullptr;
  IBlackmagicRawProcessedImage* deferred_process_image_ = nullptr;
  /** <= 0: wait until handoff (no timed wait; avoids spurious timeout). */
  int handoff_timeout_sec_ = 120;
  bool debug_trace_ = false;
  bool defer_success_release_to_main_ = false;
  bool flush_unwind_probe_ = false;
  std::atomic<uint64_t> active_frame_index_{kUnknownFrameIndex};
  std::atomic<uint64_t> release_seq_{1};

  ~DecodeCallback();
};

static void release_deferred_callback_hold(DecodeCallback*& callback, uint64_t frame_index, const char* ctx) {
  if (callback == nullptr)
    return;
  const ULONG callback_ref_after_release = callback->Release();
  std::fprintf(stderr,
    "[ffmpeg-braw trace] %s: callback Release after deferred async job completion (frame=%s ref=%lu tid=%zu)\n",
    ctx != nullptr ? ctx : "deferred callback hold release", frame_index_label(frame_index).c_str(),
    static_cast<unsigned long>(callback_ref_after_release), braw_trace_tid_hash());
  std::fflush(stderr);
  callback = nullptr;
}

bool DecodeCallback::wait_processed(uint64_t frame_index) {
  std::fprintf(stderr, "braw-proxy-cli: consumer: enter wait_processed (frame=%llu timeout_sec=%d tid=%zu)\n",
    static_cast<unsigned long long>(frame_index), handoff_timeout_sec_, braw_trace_tid_hash());
  std::fflush(stderr);
  std::unique_lock<std::mutex> lk(mu_);
  const bool already_ready = frame_ready_;
  std::fprintf(stderr,
    "braw-proxy-cli: consumer: wait mutex acquired (frame=%llu packet_already_ready=%d valid=%d hr=0x%08x tid=%zu)\n",
    static_cast<unsigned long long>(frame_index), already_ready ? 1 : 0, pending_.valid ? 1 : 0,
    static_cast<unsigned int>(last_hr_), braw_trace_tid_hash());
  std::fflush(stderr);
  bool woke = false;
  if (handoff_timeout_sec_ <= 0) {
    cv_.wait(lk, [&] { return frame_ready_; });
    woke = frame_ready_;
  } else {
    woke = cv_.wait_for(lk, std::chrono::seconds(handoff_timeout_sec_), [&] { return frame_ready_; });
  }
  const bool packet_ok = woke && frame_ready_ && SUCCEEDED(last_hr_) && pending_.valid;
  std::fprintf(stderr,
    "braw-proxy-cli: consumer: wait_processed exit (frame=%llu woke=%d ready=%d valid=%d hr=0x%08x "
    "packet_ok=%d tid=%zu)\n",
    static_cast<unsigned long long>(frame_index), woke ? 1 : 0, frame_ready_ ? 1 : 0, pending_.valid ? 1 : 0,
    static_cast<unsigned int>(last_hr_), packet_ok ? 1 : 0, braw_trace_tid_hash());
  std::fflush(stderr);
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: trace: consumer wake detail (timed_wait=%s)\n",
      handoff_timeout_sec_ <= 0 ? "off" : "on");
    std::fflush(stderr);
  }
  if (woke && frame_ready_) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] wait_processed: woke (frame_ready=1 last_hr=0x%08x valid=%d tid=%zu)\n",
      static_cast<unsigned int>(last_hr_), static_cast<int>(pending_.valid), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  return packet_ok;
}

DecodeCallback::~DecodeCallback() {
  std::fprintf(stderr, "braw-proxy-cli: DecodeCallback::~DecodeCallback (tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);
  std::fprintf(stderr, "braw-proxy-cli: frame-track: destructor active_frame=%s tid=%zu\n",
    frame_index_label(active_frame_index_.load(std::memory_order_acquire)).c_str(), braw_trace_tid_hash());
  std::fflush(stderr);
  IBlackmagicRawJob* j = nullptr;
  IBlackmagicRawProcessedImage* im = nullptr;
  {
    std::lock_guard<std::mutex> lk(mu_);
    j = deferred_process_job_;
    im = deferred_process_image_;
    deferred_process_job_ = nullptr;
    deferred_process_image_ = nullptr;
  }
  DecodeCallback* cb = nullptr;
  merge_external_deferred_sdk_pair(j, im, cb, "~DecodeCallback");
  release_bmd_deferred_sdk_pair(j, im, "~DecodeCallback");
  release_deferred_callback_hold(cb, kUnknownFrameIndex, "~DecodeCallback");
}

void DecodeCallback::set_active_frame_index(uint64_t frame_index) {
  active_frame_index_.store(frame_index, std::memory_order_release);
  const std::string frame_label = frame_index_label(frame_index);
  std::fprintf(stderr,
    "braw-proxy-cli: frame-track: set active_frame=%s tid=%zu\n", frame_label.c_str(), braw_trace_tid_hash());
  std::fflush(stderr);
}

uint64_t DecodeCallback::take_active_frame_index() {
  const uint64_t frame_index = active_frame_index_.exchange(kUnknownFrameIndex, std::memory_order_acq_rel);
  const std::string frame_label = frame_index_label(frame_index);
  std::fprintf(stderr,
    "braw-proxy-cli: frame-track: clear active_frame=%s tid=%zu\n", frame_label.c_str(), braw_trace_tid_hash());
  std::fflush(stderr);
  return frame_index;
}

uint64_t DecodeCallback::next_release_seq() { return release_seq_.fetch_add(1, std::memory_order_relaxed); }

void DecodeCallback::reset_wait() {
  IBlackmagicRawJob* j = nullptr;
  IBlackmagicRawProcessedImage* im = nullptr;
  DecodeCallback* cb = nullptr;
  const uint64_t active_frame = active_frame_index_.load(std::memory_order_acquire);
  {
    std::lock_guard<std::mutex> lk(mu_);
    std::fprintf(stderr,
      "braw-proxy-cli: producer: reset_wait — clear pending (active_frame=%s had_pixels=%zu valid=%d) steal deferred job=%p img=%p "
      "(tid=%zu)\n",
      frame_index_label(active_frame).c_str(), pending_.pixels.size(), pending_.valid ? 1 : 0,
      static_cast<void*>(deferred_process_job_),
      static_cast<void*>(deferred_process_image_), braw_trace_tid_hash());
    std::fprintf(stderr, "[ffmpeg-braw trace] reset_wait: steal deferred + clear pending (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    j = deferred_process_job_;
    im = deferred_process_image_;
    deferred_process_job_ = nullptr;
    deferred_process_image_ = nullptr;
    pending_ = FrameHandoffPacket{};
    frame_ready_ = false;
    last_hr_ = S_OK;
  }
  merge_external_deferred_sdk_pair(j, im, cb, "reset_wait(between frames)");
  release_bmd_deferred_sdk_pair(j, im, "reset_wait(between frames)");
  release_deferred_callback_hold(cb, active_frame, "reset_wait(between frames)");
}

void DecodeCallback::release_deferred_process_sdk_main() {
  IBlackmagicRawJob* j = nullptr;
  IBlackmagicRawProcessedImage* im = nullptr;
  DecodeCallback* cb = nullptr;
  {
    std::lock_guard<std::mutex> lk(mu_);
    j = deferred_process_job_;
    im = deferred_process_image_;
    deferred_process_job_ = nullptr;
    deferred_process_image_ = nullptr;
  }
  merge_external_deferred_sdk_pair(j, im, cb, "wait_processed failed cleanup");
  release_bmd_deferred_sdk_pair(j, im, "wait_processed failed cleanup");
  release_deferred_callback_hold(cb, kUnknownFrameIndex, "wait_processed failed cleanup");
}

bool DecodeCallback::take_completed_frame(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w, uint32_t& h,
  uint64_t frame_index) {
  IBlackmagicRawJob* rel_j = nullptr;
  IBlackmagicRawProcessedImage* rel_im = nullptr;
  DecodeCallback* rel_cb = nullptr;
  bool ok = false;

  {
    std::lock_guard<std::mutex> lk(mu_);
    std::fprintf(stderr, "braw-proxy-cli: consumer: dequeue enter (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
    std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: enter (tid=%zu)\n", braw_trace_tid_hash());
    std::fflush(stderr);
    if (!frame_ready_) {
      std::fprintf(stderr, "braw-proxy-cli: consumer: dequeue abort !frame_ready (frame=%llu)\n",
        static_cast<unsigned long long>(frame_index));
      std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: !frame_ready_\n");
      std::fflush(stderr);
      return false;
    }
    if (!SUCCEEDED(last_hr_) || !pending_.valid) {
      std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: bad packet (last_hr=0x%08x valid=%d)\n",
        static_cast<unsigned int>(last_hr_), static_cast<int>(pending_.valid));
      std::fflush(stderr);
      rel_j = deferred_process_job_;
      rel_im = deferred_process_image_;
      deferred_process_job_ = nullptr;
      deferred_process_image_ = nullptr;
      pending_ = FrameHandoffPacket{};
      frame_ready_ = false;
    } else {
      const size_t psz = pending_.pixels.size();
      std::fprintf(stderr,
        "braw-proxy-cli: consumer: pending packet before move data=%p size=%zu capacity=%zu (frame=%llu tid=%zu)\n",
        pending_.pixels.empty() ? nullptr : static_cast<void*>(pending_.pixels.data()), psz, pending_.pixels.capacity(),
        static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
      std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: before move (pending_pixels=%zu tid=%zu)\n", psz,
        braw_trace_tid_hash());
      std::fflush(stderr);
      row_bytes = pending_.row_bytes;
      w = pending_.w;
      h = pending_.h;
      const size_t expect = static_cast<size_t>(row_bytes) * static_cast<size_t>(h);
      if (expect != pending_.pixels.size()) {
        std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: size mismatch expect=%zu got=%zu\n", expect,
          pending_.pixels.size());
        std::fflush(stderr);
        rel_j = deferred_process_job_;
        rel_im = deferred_process_image_;
        deferred_process_job_ = nullptr;
        deferred_process_image_ = nullptr;
        pending_ = FrameHandoffPacket{};
        frame_ready_ = false;
      } else {
        owned = std::move(pending_.pixels);
        pending_ = FrameHandoffPacket{};
        frame_ready_ = false;
        std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: packet moved to owner; stealing deferred SDK ptrs "
                                      "(tid=%zu)\n",
          braw_trace_tid_hash());
        std::fflush(stderr);
        rel_j = deferred_process_job_;
        rel_im = deferred_process_image_;
        deferred_process_job_ = nullptr;
        deferred_process_image_ = nullptr;
        std::fprintf(stderr,
          "[ffmpeg-braw trace] take_completed_frame: deferred slots nulled under mu_ (job was=%p img was=%p tid=%zu)\n",
          static_cast<void*>(rel_j), static_cast<void*>(rel_im), braw_trace_tid_hash());
        std::fflush(stderr);
        ok = true;
        std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: after move/clear (owned=%zu tid=%zu)\n",
          owned.size(), braw_trace_tid_hash());
        std::fflush(stderr);
        std::fprintf(stderr,
          "braw-proxy-cli: consumer: dequeue OK (frame=%llu bytes=%zu w=%u h=%u row_bytes=%u owned.data=%p "
          "owned.cap=%zu tid=%zu)\n",
          static_cast<unsigned long long>(frame_index), owned.size(), w, h, row_bytes,
          owned.empty() ? nullptr : static_cast<void*>(owned.data()), owned.capacity(), braw_trace_tid_hash());
        std::fflush(stderr);
        if (debug_trace_) {
          std::fprintf(stderr,
            "braw-proxy-cli: trace: packet dequeue (bytes=%zu w=%u h=%u row_bytes=%u)\n", owned.size(), w, h,
            row_bytes);
          std::fflush(stderr);
        }
      }
    }
  }

  merge_external_deferred_sdk_pair(rel_j, rel_im, rel_cb,
    ok ? "main after packet consumed (before on_frame / next SDK call)" : "main take_completed_frame error path");
  std::fprintf(stderr,
    "braw-proxy-cli: consumer: take_completed_frame Release step (frame=%llu ok=%d deferred img=%p job=%p tid=%zu)\n",
    static_cast<unsigned long long>(frame_index), ok ? 1 : 0, static_cast<void*>(rel_im), static_cast<void*>(rel_j),
    braw_trace_tid_hash());
  std::fflush(stderr);
  release_bmd_deferred_sdk_pair(rel_j, rel_im,
    ok ? "main after packet consumed (before on_frame / next SDK call)" : "main take_completed_frame error path");
  release_deferred_callback_hold(rel_cb, frame_index,
    ok ? "main after packet consumed (before on_frame / next SDK call)" : "main take_completed_frame error path");
  if (ok) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] take_completed_frame: SDK deferred pair released on main; members already null (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
  } else {
    std::fprintf(stderr, "braw-proxy-cli: consumer: dequeue FAILED (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  return ok;
}

void DecodeCallback::DecodeComplete(IBlackmagicRawJob* job, HRESULT result) {
  std::fprintf(stderr, "[ffmpeg-braw trace] decode callback fired (DecodeComplete job=%p hr=0x%08x tid=%zu)\n",
    static_cast<void*>(job), static_cast<unsigned int>(result), braw_trace_tid_hash());
  std::fflush(stderr);
}

void DecodeCallback::ReadComplete(IBlackmagicRawJob* readJob, HRESULT result, IBlackmagicRawFrame* frame) {
  std::fprintf(stderr, "[ffmpeg-braw trace] read callback fired (ReadComplete tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);

  IBlackmagicRawJob* decodeAndProcessJob = nullptr;
  const uint64_t frame_index = active_frame_index_.load(std::memory_order_acquire);
  std::fprintf(stderr, "braw-proxy-cli: frame-track: ReadComplete sees active_frame=%s readJob=%p tid=%zu\n",
    frame_index_label(frame_index).c_str(), static_cast<void*>(readJob), braw_trace_tid_hash());
  std::fflush(stderr);
  if (readJob == nullptr || frame == nullptr) {
    if (readJob)
      readJob->Release();
    set_active_frame_index(kUnknownFrameIndex);
    std::lock_guard<std::mutex> lk(mu_);
    pending_ = FrameHandoffPacket{};
    last_hr_ = E_POINTER;
    frame_ready_ = true;
    cv_.notify_one();
    return;
  }

  if (FAILED(result)) {
    readJob->Release();
    set_active_frame_index(kUnknownFrameIndex);
    std::lock_guard<std::mutex> lk(mu_);
    pending_ = FrameHandoffPacket{};
    last_hr_ = result;
    frame_ready_ = true;
    cv_.notify_one();
    return;
  }

  HRESULT hr = S_OK;
  IBlackmagicRawFrameProcessingAttributes* frameAttr = nullptr;
  hr = frame->CloneFrameProcessingAttributes(&frameAttr);
  if (FAILED(hr) || frameAttr == nullptr) {
    safe_release(frame);
    readJob->Release();
    set_active_frame_index(kUnknownFrameIndex);
    std::lock_guard<std::mutex> lk(mu_);
    pending_ = FrameHandoffPacket{};
    last_hr_ = FAILED(hr) ? hr : E_FAIL;
    frame_ready_ = true;
    cv_.notify_one();
    return;
  }

  /** ProcessClipCPU order: output format + scale on frame, then CreateJobDecodeAndProcessFrame. */
  hr = frame->SetResourceFormat(blackmagicRawResourceFormatRGBAU8);
  if (SUCCEEDED(hr))
    hr = frame->SetResolutionScale(scale);
  if (SUCCEEDED(hr))
    hr = frame->CreateJobDecodeAndProcessFrame(clip_attrs, frameAttr, &decodeAndProcessJob);

  safe_release(frameAttr);

  if (FAILED(hr) || decodeAndProcessJob == nullptr) {
    safe_release(frame);
    readJob->Release();
    set_active_frame_index(kUnknownFrameIndex);
    std::lock_guard<std::mutex> lk(mu_);
    pending_ = FrameHandoffPacket{};
    last_hr_ = FAILED(hr) ? hr : E_FAIL;
    frame_ready_ = true;
    cv_.notify_one();
    return;
  }

  hr = decodeAndProcessJob->SetUserData(static_cast<void*>(this));
  if (FAILED(hr)) {
    safe_release(decodeAndProcessJob);
    safe_release(frame);
    readJob->Release();
    set_active_frame_index(kUnknownFrameIndex);
    std::lock_guard<std::mutex> lk(mu_);
    pending_ = FrameHandoffPacket{};
    last_hr_ = hr;
    frame_ready_ = true;
    cv_.notify_one();
    return;
  }

  /**
   * SetUserData stores only a raw pointer. Keep the callback alive until ProcessComplete finishes for this job.
   */
  const ULONG callback_ref_after_job_hold = AddRef();
  std::fprintf(stderr,
    "[ffmpeg-braw trace] ReadComplete: callback AddRef for process job (frame=%s ref=%lu tid=%zu)\n",
    frame_index_label(frame_index).c_str(), static_cast<unsigned long>(callback_ref_after_job_hold), braw_trace_tid_hash());
  std::fflush(stderr);

  hr = decodeAndProcessJob->Submit();
  if (SUCCEEDED(hr)) {
    std::fprintf(stderr, "[ffmpeg-braw trace] decode job submitted (CreateJobDecodeAndProcessFrame)\n");
    std::fprintf(stderr, "[ffmpeg-braw trace] process job submitted (decode+process combined; same job)\n");
    std::fflush(stderr);
  }

  /**
   * BRAWconverter / SDK contract: do not Release the IBlackmagicRawFrame here after Submit.
   * The decode+process job owns the frame until the pipeline completes; releasing early segfaults inside the SDK.
   */
  readJob->Release();

  if (FAILED(hr)) {
    const ULONG callback_ref_after_submit_fail = Release();
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ReadComplete: callback Release after failed Submit (frame=%s ref=%lu tid=%zu)\n",
      frame_index_label(frame_index).c_str(), static_cast<unsigned long>(callback_ref_after_submit_fail),
      braw_trace_tid_hash());
    std::fflush(stderr);
    safe_release(decodeAndProcessJob);
    set_active_frame_index(kUnknownFrameIndex);
    std::lock_guard<std::mutex> lk(mu_);
    pending_ = FrameHandoffPacket{};
    last_hr_ = hr;
    frame_ready_ = true;
    cv_.notify_one();
    return;
  }

  std::fprintf(stderr, "[ffmpeg-braw trace] process pipeline queued (await ProcessComplete)\n");
  std::fflush(stderr);
}

void DecodeCallback::ProcessComplete(
  IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage) {
  std::fprintf(stderr, "[ffmpeg-braw trace] process callback fired (ProcessComplete tid=%zu)\n", braw_trace_tid_hash());
  std::fprintf(stderr, "[ffmpeg-braw trace] 8 processed image callback entered (tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);

  /* Current job/image pair is retired on this callback thread after state is published to the main thread. */
  IBlackmagicRawJob* rel_job = job;
  IBlackmagicRawProcessedImage* rel_img = processedImage;
  const char* return_path = "unset";
  struct ProcessCompleteExitTrace {
    const char*& return_path;
    ~ProcessCompleteExitTrace() {
      std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: function exit boundary (%s tid=%zu)\n", return_path,
        braw_trace_tid_hash());
      std::fflush(stderr);
    }
  } exit_trace{return_path};

  DecodeCallback* self = nullptr;
  if (rel_job != nullptr)
    rel_job->GetUserData(reinterpret_cast<void**>(&self));
  uint64_t frame_index = kUnknownFrameIndex;
  bool release_callback_after_return = true;
  const auto release_job_callback_ref = [&]() {
    if (self != nullptr) {
      const ULONG callback_ref_after_job_release = self->Release();
      std::fprintf(stderr,
        "[ffmpeg-braw trace] ProcessComplete: callback Release after async job completion (frame=%s ref=%lu tid=%zu)\n",
        frame_index_label(frame_index).c_str(), static_cast<unsigned long>(callback_ref_after_job_release),
        braw_trace_tid_hash());
      std::fflush(stderr);
      self = nullptr;
    }
  };
  frame_index = self != nullptr ? self->take_active_frame_index() : kUnknownFrameIndex;
  if (self != nullptr) {
    bool pending_valid = false;
    IBlackmagicRawJob* deferred_job = nullptr;
    IBlackmagicRawProcessedImage* deferred_img = nullptr;
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      pending_valid = self->pending_.valid;
      deferred_job = self->deferred_process_job_;
      deferred_img = self->deferred_process_image_;
    }
    std::fprintf(stderr,
      "braw-proxy-cli: producer: ProcessComplete state entry frame=%s pending_valid=%d deferred_job=%p deferred_img=%p "
      "tid=%zu\n",
      frame_index_label(frame_index).c_str(), pending_valid ? 1 : 0, static_cast<void*>(deferred_job),
      static_cast<void*>(deferred_img), braw_trace_tid_hash());
    std::fflush(stderr);
  }

  if (self == nullptr || rel_job == nullptr || rel_img == nullptr) {
    if (self != nullptr) {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->pending_ = FrameHandoffPacket{};
      self->last_hr_ = E_POINTER;
      self->frame_ready_ = true;
      self->cv_.notify_one();
    } else {
      sdk_release_after_process_complete(rel_img, rel_job);
      std::fprintf(stderr,
        "[ffmpeg-braw trace] ProcessComplete: returning (edge path; self=%p deferred=0 immediate_release=1 tid=%zu)\n",
        static_cast<void*>(self), braw_trace_tid_hash());
      std::fflush(stderr);
      return_path = "edge-path no-self immediate release";
      release_job_callback_ref();
      return;
    }
    release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(E_POINTER callback-thread release)", frame_index,
      self->next_release_seq());
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning (edge path; self=%p deferred=0 immediate_release=1 tid=%zu)\n",
      static_cast<void*>(self), braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "edge-path callback-thread release";
    release_job_callback_ref();
    return;
  }

  if (FAILED(result)) {
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->pending_ = FrameHandoffPacket{};
      self->last_hr_ = result;
      self->frame_ready_ = true;
      self->cv_.notify_one();
    }
    release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(FAILED result callback-thread release)", frame_index,
      self->next_release_seq());
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning after FAILED(result); current pair released on callback thread "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "failed-result callback-thread release";
    release_job_callback_ref();
    return;
  }

  uint32_t width = 0;
  uint32_t height = 0;
  uint32_t sizeBytes = 0;
  BlackmagicRawResourceFormat resourceFormat = blackmagicRawResourceFormatRGBAU8;
  BlackmagicRawResourceType resourceType = blackmagicRawResourceTypeBufferCPU;
  void* imageData = nullptr;

  HRESULT hr = rel_img->GetWidth(&width);
  if (SUCCEEDED(hr))
    hr = rel_img->GetHeight(&height);
  if (SUCCEEDED(hr)) {
    std::fprintf(stderr, "[ffmpeg-braw trace] 9 width/height acquired (w=%u h=%u)\n", width, height);
    std::fflush(stderr);
  }
  if (SUCCEEDED(hr))
    hr = rel_img->GetResourceSizeBytes(&sizeBytes);
  if (SUCCEEDED(hr))
    hr = rel_img->GetResourceFormat(&resourceFormat);
  if (SUCCEEDED(hr))
    hr = rel_img->GetResourceType(&resourceType);
  if (SUCCEEDED(hr))
    hr = rel_img->GetResource(&imageData);

  if (SUCCEEDED(hr) && imageData != nullptr) {
    std::fprintf(stderr, "[ffmpeg-braw trace] 10 pixel/resource buffer acquired (ptr=%p sizeBytes=%u)\n",
      static_cast<void*>(imageData), sizeBytes);
    std::fprintf(stderr, "[ffmpeg-braw trace] processed buffer acquired\n");
    std::fflush(stderr);
  }

  if (FAILED(hr) || imageData == nullptr || width == 0 || height == 0 || sizeBytes == 0) {
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->pending_ = FrameHandoffPacket{};
      self->last_hr_ = FAILED(hr) ? hr : E_FAIL;
      self->frame_ready_ = true;
      self->cv_.notify_one();
    }
    release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(resource error callback-thread release)", frame_index,
      self->next_release_seq());
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning after resource/dimension error (tid=%zu)\n", braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "resource error callback-thread release";
    release_job_callback_ref();
    return;
  }

  if (resourceType != blackmagicRawResourceTypeBufferCPU || resourceFormat != blackmagicRawResourceFormatRGBAU8) {
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->pending_ = FrameHandoffPacket{};
      self->last_hr_ = E_FAIL;
      self->frame_ready_ = true;
      self->cv_.notify_one();
    }
    release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(format error callback-thread release)", frame_index,
      self->next_release_seq());
    std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: returning after format mismatch (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "format mismatch callback-thread release";
    release_job_callback_ref();
    return;
  }

  /** Stride: bytes-per-row from total size; plane size is rowBytes * height (must fit in GetResourceSizeBytes). */
  uint32_t rowBytes = sizeBytes / height;
  if (rowBytes < width * 4u) {
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->pending_ = FrameHandoffPacket{};
      self->last_hr_ = E_FAIL;
      self->frame_ready_ = true;
      self->cv_.notify_one();
    }
    release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(rowBytes error callback-thread release)", frame_index,
      self->next_release_seq());
    std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: returning after rowBytes check (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "row-bytes check callback-thread release";
    release_job_callback_ref();
    return;
  }

  const uint32_t tight_stride = width * 4u;
  const uint64_t src_plane_u64 = static_cast<uint64_t>(rowBytes) * static_cast<uint64_t>(height);
  if (src_plane_u64 == 0ULL || src_plane_u64 > static_cast<uint64_t>(sizeBytes)
      || src_plane_u64 > static_cast<uint64_t>((std::numeric_limits<size_t>::max)())) {
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->pending_ = FrameHandoffPacket{};
      self->last_hr_ = E_FAIL;
      self->frame_ready_ = true;
      self->cv_.notify_one();
    }
    release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(plane size error callback-thread release)",
      frame_index, self->next_release_seq());
    std::fprintf(stderr, "[ffmpeg-braw trace] ProcessComplete: returning after plane size check (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "plane-size check callback-thread release";
    release_job_callback_ref();
    return;
  }

  if (self->flush_unwind_probe_) {
    IUnknown* job_identity_probe = query_iunknown_identity(job);
    IUnknown* img_identity_probe = query_iunknown_identity(processedImage);
    const bool identities_known_probe = job_identity_probe != nullptr && img_identity_probe != nullptr;
    const bool same_identity_probe = identities_known_probe && job_identity_probe == img_identity_probe;
    safe_release(job_identity_probe);
    safe_release(img_identity_probe);
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: flush-unwind-probe — skip copy/publish; immediate callback-thread COM "
      "release (frame=%s job=%p img=%p same_identity=%d tid=%zu)\n",
      frame_index_label(frame_index).c_str(), static_cast<void*>(job), static_cast<void*>(processedImage),
      same_identity_probe ? 1 : 0, braw_trace_tid_hash());
    std::fflush(stderr);
    const char* probe_ctx = same_identity_probe ? "ProcessComplete(flush-unwind-probe job Release only)"
                                                : "ProcessComplete(flush-unwind-probe image then job Release)";
    if (same_identity_probe)
      release_bmd_sdk_pair_logged(job, nullptr, probe_ctx, frame_index, self->next_release_seq());
    else
      release_bmd_sdk_pair_logged(job, processedImage, probe_ctx, frame_index, self->next_release_seq());
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: flush-unwind-probe — COM released; returning to SDK (tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "flush-unwind-probe immediate COM release no publish";
    release_job_callback_ref();
    return;
  }

  // FFmpeg rawvideo rgba expects exactly width*4 bytes per row (no trailing row padding).
  std::vector<uint8_t> plane;
  size_t plane_bytes = 0;
  if (rowBytes == tight_stride) {
    plane_bytes = static_cast<size_t>(src_plane_u64);
    plane.resize(plane_bytes);
    std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned copy start (tight stride, plane_bytes=%zu sizeBytes=%u tid=%zu)\n",
      plane_bytes, sizeBytes, braw_trace_tid_hash());
    std::fflush(stderr);
    std::memcpy(plane.data(), imageData, plane_bytes);
  } else {
    plane_bytes = static_cast<size_t>(tight_stride) * static_cast<size_t>(height);
    plane.resize(plane_bytes);
    std::fprintf(stderr,
      "[ffmpeg-braw trace] SDK→owned tight-pack (sdk_row=%u tight_row=%u h=%u out_bytes=%zu tid=%zu)\n", rowBytes,
      tight_stride, height, plane_bytes, braw_trace_tid_hash());
    std::fflush(stderr);
    const auto* src = static_cast<const uint8_t*>(imageData);
    uint8_t* dst = plane.data();
    for (uint32_t row = 0; row < height; ++row) {
      std::memcpy(dst + static_cast<size_t>(row) * tight_stride, src + static_cast<size_t>(row) * rowBytes,
        tight_stride);
    }
    rowBytes = tight_stride;
  }
  std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned copy complete (plane_bytes=%zu row_bytes_out=%u tid=%zu)\n",
    plane_bytes, rowBytes, braw_trace_tid_hash());
  std::fflush(stderr);

  IUnknown* job_identity = query_iunknown_identity(job);
  IUnknown* img_identity = query_iunknown_identity(processedImage);
  const bool identities_known = job_identity != nullptr && img_identity != nullptr;
  const bool same_identity = identities_known && job_identity == img_identity;
  std::fprintf(stderr,
    "braw-proxy-cli: producer: COM identity compare success-path same=%d known=%d job_id=%p img_id=%p tid=%zu\n",
    same_identity ? 1 : 0, identities_known ? 1 : 0, static_cast<void*>(job_identity),
    static_cast<void*>(img_identity), braw_trace_tid_hash());
  std::fflush(stderr);
  safe_release(job_identity);
  safe_release(img_identity);
  const char* release_ctx = same_identity
                                ? "ProcessComplete(success callback-thread canonical job Release only)"
                                : "ProcessComplete(success callback-thread image then job Release)";
  const std::string frame_label = frame_index_label(frame_index);

  {
    std::lock_guard<std::mutex> lk(self->mu_);
    std::fprintf(stderr, "[ffmpeg-braw trace] handoff: publish packet (pixels=%zu w=%u h=%u row=%u tid=%zu)\n",
      plane.size(), width, height, rowBytes, braw_trace_tid_hash());
    std::fflush(stderr);
    self->deferred_process_job_ = nullptr;
    self->deferred_process_image_ = nullptr;
    self->pending_ = FrameHandoffPacket{};
    self->pending_.pixels = std::move(plane);
    self->pending_.w = width;
    self->pending_.h = height;
    self->pending_.row_bytes = rowBytes;
    self->pending_.valid = true;
    self->last_hr_ = S_OK;
    self->frame_ready_ = true;
    std::fprintf(stderr, "[ffmpeg-braw trace] handoff: before notify (tid=%zu)\n", braw_trace_tid_hash());
    std::fflush(stderr);
    self->cv_.notify_all();
    std::fprintf(stderr, "[ffmpeg-braw trace] handoff: after notify (tid=%zu)\n", braw_trace_tid_hash());
    std::fflush(stderr);
  }
  if (self->defer_success_release_to_main_) {
    const char* defer_ctx = same_identity
                              ? "ProcessComplete(success defer canonical job Release to main)"
                              : "ProcessComplete(success defer image+job Release to main)";
    store_external_deferred_sdk_pair(
      job, same_identity ? nullptr : processedImage, self, frame_index, defer_ctx);
    std::fprintf(stderr,
      "braw-proxy-cli: producer: chosen COM release strategy: %s (frame=%s img=%p job=%p tid=%zu)\n", defer_ctx,
      frame_label.c_str(), static_cast<void*>(processedImage), static_cast<void*>(job), braw_trace_tid_hash());
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: success-path COM release deferred outside callback state to main safe point "
      "(frame=%s job=%p img=%p tid=%zu)\n",
      frame_label.c_str(), static_cast<void*>(job),
      same_identity ? nullptr : static_cast<void*>(processedImage), braw_trace_tid_hash());
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: callback Release deferred to later safe point (frame=%s self=%p tid=%zu)\n",
      frame_label.c_str(), static_cast<void*>(self), braw_trace_tid_hash());
    std::fflush(stderr);
    release_callback_after_return = false;
  } else {
    std::fprintf(stderr,
      "braw-proxy-cli: producer: chosen COM release strategy: %s (frame=%s img=%p job=%p tid=%zu)\n", release_ctx,
      frame_label.c_str(), static_cast<void*>(processedImage), static_cast<void*>(job), braw_trace_tid_hash());
    std::fflush(stderr);
    if (same_identity)
      release_bmd_sdk_pair_logged(job, nullptr, release_ctx, frame_index, self->next_release_seq());
    else
      release_bmd_sdk_pair_logged(job, processedImage, release_ctx, frame_index, self->next_release_seq());
  }

  bool pending_valid = false;
  IBlackmagicRawJob* deferred_job = nullptr;
  IBlackmagicRawProcessedImage* deferred_img = nullptr;
  {
    std::lock_guard<std::mutex> lk(self->mu_);
    pending_valid = self->pending_.valid;
    deferred_job = self->deferred_process_job_;
    deferred_img = self->deferred_process_image_;
  }
  std::fprintf(stderr,
    "braw-proxy-cli: producer: ProcessComplete state exit frame=%s pending_valid=%d deferred_job=%p deferred_img=%p tid=%zu\n",
    frame_index_label(frame_index).c_str(), pending_valid ? 1 : 0, static_cast<void*>(deferred_job),
    static_cast<void*>(deferred_img), braw_trace_tid_hash());
  std::fflush(stderr);
  if (self->defer_success_release_to_main_) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning to SDK (success; COM release deferred to main safe point) "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "success deferred outside callback state";
  } else {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning to SDK (success; COM release completed on callback thread) "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "success callback-thread release";
  }
  if (release_callback_after_return) {
    release_job_callback_ref();
  } else {
    self = nullptr;
    return_path = "success deferred outside callback state + callback hold deferred";
  }
}

/**
 * CPU decode path matches BRAWconverter / ProcessClipCPU default: CreateCodec only.
 * Do not call SetPipeline(blackmagicRawPipelineCPU) unless a GPU pipeline was set first — the public
 * macOS reference app never sets CPU explicitly; forcing CPU twice can misconfigure the Linux codec.
 */
static int init_factory_codec_cpu(IBlackmagicRawFactory*& factory, IBlackmagicRaw*& codec) {
  factory = CreateBlackmagicRawFactoryInstance();
  if (factory == nullptr)
    return EX_SDK_INIT;

  const HRESULT hr = factory->CreateCodec(&codec);
  if (FAILED(hr) || codec == nullptr) {
    safe_release(factory);
    return EX_SDK_INIT;
  }

  return 0;
}

static int open_clip_on_codec(IBlackmagicRaw* codec, const std::string& input_path, IBlackmagicRawClip*& clip) {
  const HRESULT hr = codec->OpenClip(input_path.c_str(), &clip);
  if (FAILED(hr) || clip == nullptr) {
    return EX_CLIP;
  }
  return 0;
}

static int create_cpu_codec_chain(const std::string& input_path, IBlackmagicRawFactory*& factory, IBlackmagicRaw*& codec,
  IBlackmagicRawClip*& clip) {
  const int init = init_factory_codec_cpu(factory, codec);
  if (init != 0)
    return init;
  return open_clip_on_codec(codec, input_path, clip);
}

int braw_probe_clip(const std::string& input_path, ClipMeta& meta) {
  IBlackmagicRawFactory* factory = nullptr;
  IBlackmagicRaw* codec = nullptr;
  IBlackmagicRawClip* clip = nullptr;

  const int chain = create_cpu_codec_chain(input_path, factory, codec, clip);
  if (chain != 0)
    return chain;

  uint32_t w = 0;
  uint32_t h = 0;
  if (FAILED(clip->GetWidth(&w)) || FAILED(clip->GetHeight(&h)) || w == 0 || h == 0) {
    safe_release(clip);
    safe_release(codec);
    safe_release(factory);
    return EX_CLIP;
  }
  meta.clip_width = w;
  meta.clip_height = h;

  uint64_t fc = 0;
  if (FAILED(clip->GetFrameCount(&fc))) {
    safe_release(clip);
    safe_release(codec);
    safe_release(factory);
    return EX_CLIP;
  }
  meta.frame_count = fc;

  if (read_timing(clip, meta) != 0) {
    safe_release(clip);
    safe_release(codec);
    safe_release(factory);
    return EX_CLIP;
  }

  safe_release(clip);
  safe_release(codec);
  safe_release(factory);
  return 0;
}

int braw_decode_frames(const std::string& input_path, const BrawDecodeConfig& cfg, const ClipMeta& meta,
  const std::function<bool(const uint8_t* pixels, uint32_t row_bytes, uint32_t w, uint32_t h, uint64_t frame_index)>&
    on_frame) {
  std::fprintf(stderr, "[ffmpeg-braw trace] 1 entering braw_decode_frames\n");
  std::fprintf(stderr,
    "braw-proxy-cli: decode: config target_width=%d max_frames=%d clip_frames=%llu "
    "defer_success_release_main=%d flush_unwind_probe=%d tid=%zu\n",
    cfg.target_width, cfg.max_frames, static_cast<unsigned long long>(meta.frame_count),
    cfg.defer_success_release_to_main ? 1 : 0, cfg.flush_unwind_probe ? 1 : 0, braw_trace_tid_hash());
  std::fflush(stderr);

  IBlackmagicRawFactory* factory = nullptr;
  IBlackmagicRaw* codec = nullptr;
  IBlackmagicRawClip* clip = nullptr;

  const int init = init_factory_codec_cpu(factory, codec);
  if (init != 0)
    return init;
  std::fprintf(stderr, "[ffmpeg-braw trace] 2 factory created\n");
  std::fflush(stderr);

  HRESULT hr = S_OK;
  const int oc = open_clip_on_codec(codec, input_path, clip);
  if (oc != 0) {
    safe_release(codec);
    safe_release(factory);
    return oc;
  }
  std::fprintf(stderr, "[ffmpeg-braw trace] 3 clip opened\n");
  std::fflush(stderr);

  IBlackmagicRawClipProcessingAttributes* clip_attrs = nullptr;
  hr = clip->CloneClipProcessingAttributes(&clip_attrs);
  if (FAILED(hr) || clip_attrs == nullptr) {
    safe_release(clip);
    safe_release(codec);
    safe_release(factory);
    return EX_SDK_INIT;
  }

  auto* callback = new DecodeCallback();
  std::fprintf(stderr, "[ffmpeg-braw trace] 4 callback created\n");
  std::fflush(stderr);

  callback->scale = pick_resolution_scale(meta.clip_width, cfg.target_width);
  callback->clip_attrs = clip_attrs;
  callback->set_handoff_timeout_sec(cfg.handoff_timeout_sec);
  callback->set_debug_trace(cfg.debug_trace);
  callback->set_defer_success_release_to_main(cfg.defer_success_release_to_main);
  callback->set_flush_unwind_probe(cfg.flush_unwind_probe);

  hr = codec->SetCallback(callback);
  if (FAILED(hr)) {
    callback->Release();
    safe_release(clip_attrs);
    safe_release(clip);
    safe_release(codec);
    safe_release(factory);
    return EX_SDK_INIT;
  }
  std::fprintf(stderr, "[ffmpeg-braw trace] 6 callback registered\n");
  std::fflush(stderr);

  if (meta.frame_count == 0) {
    safe_release(clip_attrs);
    safe_release(clip);
    safe_release(codec);
    callback->Release();
    safe_release(factory);
    return EX_CLIP;
  }

  uint64_t last_frame = meta.frame_count > 0 ? meta.frame_count - 1ULL : 0;
  if (cfg.max_frames > 0) {
    const uint64_t cap = static_cast<uint64_t>(cfg.max_frames);
    if (cap == 0) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }
    last_frame = std::min<uint64_t>(last_frame, static_cast<uint64_t>(cap - static_cast<uint64_t>(1)));
  }
  std::fprintf(stderr,
    "braw-proxy-cli: decode: computed last_frame_index=%llu from max_frames=%d frame_count=%llu tid=%zu\n",
    static_cast<unsigned long long>(last_frame), cfg.max_frames, static_cast<unsigned long long>(meta.frame_count),
    braw_trace_tid_hash());
  std::fflush(stderr);

  for (uint64_t i = 0; i <= last_frame; ++i) {
    std::fprintf(stderr,
      "braw-proxy-cli: loop: iteration ENTER (frame_index=%llu / last=%llu tid=%zu)\n",
      static_cast<unsigned long long>(i), static_cast<unsigned long long>(last_frame), braw_trace_tid_hash());
    std::fflush(stderr);
    callback->reset_wait();
    callback->set_active_frame_index(i);
    std::fprintf(stderr, "braw-proxy-cli: loop: frame setup ready for frame=%llu tid=%zu\n",
      static_cast<unsigned long long>(i), braw_trace_tid_hash());
    std::fflush(stderr);

    IBlackmagicRawJob* readJob = nullptr;
    hr = clip->CreateJobReadFrame(i, &readJob);
    if (FAILED(hr) || readJob == nullptr) {
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }
    std::fprintf(stderr, "[ffmpeg-braw trace] 5 processing job created (read frame job, frame index %llu)\n",
      static_cast<unsigned long long>(i));
    std::fflush(stderr);

    std::fprintf(stderr, "[ffmpeg-braw trace] 7 processing started (frame index %llu)\n",
      static_cast<unsigned long long>(i));
    std::fflush(stderr);

    hr = readJob->Submit();
    if (SUCCEEDED(hr)) {
      std::fprintf(stderr, "[ffmpeg-braw trace] read job submitted (frame index %llu)\n",
        static_cast<unsigned long long>(i));
      std::fflush(stderr);
    }
    if (FAILED(hr)) {
      readJob->Release();
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    std::fprintf(stderr, "braw-proxy-cli: consumer: before FlushJobs (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(i), braw_trace_tid_hash());
    std::fprintf(stderr, "[ffmpeg-braw trace] main: entering codec->FlushJobs (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(i), braw_trace_tid_hash());
    std::fflush(stderr);
    hr = codec->FlushJobs();
    std::fprintf(stderr, "braw-proxy-cli: consumer: after FlushJobs (frame=%llu hr=0x%08x tid=%zu)\n",
      static_cast<unsigned long long>(i), static_cast<unsigned int>(hr), braw_trace_tid_hash());
    std::fprintf(stderr, "[ffmpeg-braw trace] main: codec->FlushJobs returned to caller (frame=%llu hr=0x%08x tid=%zu)\n",
      static_cast<unsigned long long>(i), static_cast<unsigned int>(hr), braw_trace_tid_hash());
    std::fflush(stderr);
    if (FAILED(hr)) {
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    if (!callback->wait_processed(i)) {
      std::fprintf(stderr,
        "braw-proxy-cli: handoff wait failed or timed out (frame_index=%llu timeout_sec=%d)\n",
        static_cast<unsigned long long>(i), cfg.handoff_timeout_sec);
      std::fflush(stderr);
      callback->set_active_frame_index(kUnknownFrameIndex);
      callback->release_deferred_process_sdk_main();
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    std::fprintf(stderr, "[ffmpeg-braw trace] main after wait_processed (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(i), braw_trace_tid_hash());
    std::fflush(stderr);

    std::vector<uint8_t> frame_owned;
    uint32_t rb = 0;
    uint32_t ow = 0;
    uint32_t oh = 0;
    if (!callback->take_completed_frame(frame_owned, rb, ow, oh, i)) {
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    std::fprintf(stderr,
      "[ffmpeg-braw trace] main: frame %llu — packet on main; deferred COM (if any) drained in take_completed_frame "
      "(tid=%zu)\n",
      static_cast<unsigned long long>(i), braw_trace_tid_hash());
    std::fflush(stderr);

    std::fprintf(stderr,
      "braw-proxy-cli: consumer: calling on_frame (frame=%llu bytes=%zu row=%u %ux%u tid=%zu)\n",
      static_cast<unsigned long long>(i), frame_owned.size(), static_cast<unsigned>(rb), static_cast<unsigned>(ow),
      static_cast<unsigned>(oh), braw_trace_tid_hash());
    std::fflush(stderr);
    if (!on_frame(frame_owned.data(), rb, ow, oh, i)) {
      std::fprintf(stderr, "braw-proxy-cli: consumer: on_frame returned false (frame=%llu)\n",
        static_cast<unsigned long long>(i));
      std::fflush(stderr);
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }
    std::fprintf(stderr, "braw-proxy-cli: consumer: on_frame OK; loop continues past frame %llu\n",
      static_cast<unsigned long long>(i));
    std::fflush(stderr);
    if (cfg.debug_trace) {
      std::fprintf(stderr, "braw-proxy-cli: trace: frame index increment past %llu\n",
        static_cast<unsigned long long>(i));
      std::fflush(stderr);
    }
    std::fprintf(stderr,
      "braw-proxy-cli: loop: iteration EXIT (frame_index=%llu frame_owned bytes=%zu data=%p tid=%zu)\n",
      static_cast<unsigned long long>(i), frame_owned.size(),
      frame_owned.empty() ? nullptr : static_cast<void*>(frame_owned.data()), braw_trace_tid_hash());
    std::fflush(stderr);
  }

  std::fprintf(stderr, "braw-proxy-cli: consumer: frame loop exit (all frames done)\n");
  std::fflush(stderr);
  std::fprintf(stderr, "[ffmpeg-braw trace] 12 frame loop completed\n");
  std::fflush(stderr);

  std::fprintf(stderr, "[ffmpeg-braw trace] 13 cleanup start\n");
  std::fflush(stderr);
  safe_release(clip_attrs);
  safe_release(clip);
  std::fprintf(stderr, "braw-proxy-cli: decode: SetCallback(nullptr) before codec Release (tid=%zu)\n",
    braw_trace_tid_hash());
  std::fflush(stderr);
  if (codec != nullptr) {
    const HRESULT cbhr = codec->SetCallback(nullptr);
    std::fprintf(stderr, "braw-proxy-cli: decode: SetCallback(nullptr) -> hr=0x%08x (tid=%zu)\n",
      static_cast<unsigned int>(cbhr), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  safe_release(codec);
  std::fprintf(stderr, "braw-proxy-cli: decode: callback->Release() (app ref; tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);
  callback->Release();
  safe_release(factory);
  std::fprintf(stderr, "[ffmpeg-braw trace] 14 cleanup complete\n");
  std::fflush(stderr);
  std::fprintf(stderr, "braw-proxy-cli: decode: braw_decode_frames normal return0 (tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);
  return 0;
}

int braw_probe_decoded_frame0_size(const std::string& input_path, const BrawDecodeConfig& cfg, const ClipMeta& meta,
  uint32_t& out_w, uint32_t& out_h) {
  out_w = 0;
  out_h = 0;
  BrawDecodeConfig one = cfg;
  one.max_frames = 1;
  std::fprintf(stderr,
    "braw-proxy-cli: probe: forcing max_frames=1 for decoded frame0 size probe (caller requested max_frames=%d)\n",
    cfg.max_frames);
  std::fflush(stderr);
  uint32_t got_w = 0;
  uint32_t got_h = 0;
  const int r = braw_decode_frames(input_path, one, meta,
    [&](const uint8_t* pixels, uint32_t row_bytes, uint32_t w, uint32_t h, uint64_t frame_index) -> bool {
      (void)pixels;
      (void)row_bytes;
      if (frame_index != 0)
        return true;
      got_w = w;
      got_h = h;
      std::fprintf(stderr,
        "braw-proxy-cli: probe: decoded frame0 size from SDK: %ux%u (row_bytes=%u plane_bytes=%zu)\n",
        static_cast<unsigned>(w), static_cast<unsigned>(h), static_cast<unsigned>(row_bytes),
        static_cast<size_t>(row_bytes) * static_cast<size_t>(h));
      std::fflush(stderr);
      return true;
    });
  if (r != 0)
    return r;
  if (got_w == 0 || got_h == 0) {
    std::fprintf(stderr, "braw-proxy-cli: probe: frame0 dimensions missing after decode\n");
    std::fflush(stderr);
    return EX_DECODE;
  }
  out_w = got_w;
  out_h = got_h;
  return 0;
}
