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
#include <memory>
#include <mutex>
#include <thread>
#include <unordered_map>
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

static std::string frame_index_label(uint64_t frame_index) {
  return frame_index == kUnknownFrameIndex ? "unknown" : std::to_string(frame_index);
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
 * Main-thread dequeue bundle: production uses one heap instance per decode iteration, destroyed before the next frame
 * (see repro_legacy_consumer_stack_bundle for the legacy stack-reuse path).
 */
struct CompletedFrame {
  std::vector<uint8_t> pixels;
  uint32_t row_bytes = 0;
  uint32_t w = 0;
  uint32_t h = 0;
};

class DecodeCallback;

enum class FrameContextState {
  Scheduled,
  ReadCompleteEntered,
  ProcessCompleteEntered,
  Published,
  Dequeued,
  Consumed,
  Failed,
  StaleIgnored,
};

struct FrameCallbackContext {
  DecodeCallback* owner = nullptr;
  uint64_t frame_index = kUnknownFrameIndex;
  uint64_t seq = 0;
  IBlackmagicRawJob* read_job = nullptr;
  IBlackmagicRawJob* process_job = nullptr;
  IBlackmagicRawProcessedImage* processed_image = nullptr;
  FrameContextState state = FrameContextState::Scheduled;
  bool stale = false;
};

/**
 * Codec callback matching ProcessClipCPU: COM refcounting, ReadComplete → decode+process job,
 * ProcessComplete copies CPU RGBA8 while IBlackmagicRawProcessedImage is still alive.
 * Success path: copy pixels, publish pending, notify, then either release COM on the callback thread or defer that
 * release to the main-thread safe point in take_completed_frame() for crash isolation.
 * Multi-frame Linux crashes were rooted in inferring frame identity from callback-global state. Production now creates
 * a per-frame context with a strict sequence id at schedule time and carries that context through the SDK job
 * userData path so ReadComplete / ProcessComplete / dequeue cannot alias the next frame's state.
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
  void set_process_complete_experiment(int mode) { process_complete_experiment_ = mode; }
  void set_consumer_handoff_experiment(int mode) { consumer_handoff_experiment_ = mode; }
  void set_handoff_copy_pixels(bool on) { handoff_copy_pixels_ = on; }
  void set_fresh_owned_per_frame(bool on) { fresh_owned_per_frame_ = on; }
  uint64_t begin_frame_sequence(uint64_t frame_index);
  bool tag_job_with_frame_sequence(IBlackmagicRawJob* job, uint64_t frame_seq, const char* stage);
  void finish_frame_sequence(uint64_t frame_seq, uint64_t frame_index);

  bool wait_processed(uint64_t frame_index, uint64_t frame_seq);

  /**
   * After successful wait_processed(), transfers the completed frame out under mu_ (copy by default; optional move).
   * Caller writes to FFmpeg after this returns (no callback locks held).
   */
  bool take_completed_frame(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w, uint32_t& h,
    uint64_t frame_index, uint64_t frame_seq);

  /**
   * Production-only dequeue (Ubuntu known-good path): always allocates a new pixel vector for this frame and memcpy-copies
   * from pending_. No copy/move-into-caller reuse branch. Used only when both repro-legacy consumer flags are off.
   */
  bool take_completed_frame_production_fresh(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w, uint32_t& h,
    uint64_t frame_index, uint64_t frame_seq);

  /** If wait_processed() fails, still release any job/img ProcessComplete deferred (main thread). */
  void release_deferred_process_sdk_main();
  /** Debug/experiment helper: aggressively scrub consumer-visible frame state after on_frame. */
  void scrub_after_on_frame(uint64_t frame_index);
  void set_active_frame_index(uint64_t frame_index);

 private:
  uint64_t next_release_seq();
  FrameCallbackContext* lookup_frame_context_locked(uint64_t frame_seq);
  FrameCallbackContext* context_from_job(IBlackmagicRawJob* job, const char* stage);
  void publish_frame_failure_locked(FrameCallbackContext* ctx, HRESULT hr, bool notify);

  std::atomic<ULONG> ref_count_{1};
  std::mutex mu_;
  std::condition_variable cv_;
  /**
   * Consumer gate: wait_processed() blocks until true; take_completed_frame() requires true to dequeue.
   * Writers: ProcessComplete success path, ReadComplete/error paths. Cleared: reset_wait, take_completed_frame
   * (success/error), ReadComplete error branches. Invariant: when true for success, pending_.valid && plane dims
   * should match pending_.pixels (see take_completed_frame size check).
   */
  bool frame_ready_ = false;
  HRESULT last_hr_ = S_OK;
  FrameHandoffPacket pending_{};
  uint64_t ready_frame_seq_ = 0;
  uint64_t pending_frame_seq_ = 0;
  uint64_t deferred_frame_seq_ = 0;
  IBlackmagicRawJob* deferred_process_job_ = nullptr;
  IBlackmagicRawProcessedImage* deferred_process_image_ = nullptr;
  /** <= 0: wait until handoff (no timed wait; avoids spurious timeout). */
  int handoff_timeout_sec_ = 120;
  bool debug_trace_ = false;
  bool defer_success_release_to_main_ = false;
  int process_complete_experiment_ = 0;
  int consumer_handoff_experiment_ = 0;
  bool handoff_copy_pixels_ = true;
  /** Legacy `take_completed_frame` only: if true, memcpy into a new vector; if false, copy/move into caller storage. */
  bool fresh_owned_per_frame_ = true;
  void* fresh_owned_prev_data_ = nullptr;
  size_t fresh_owned_prev_cap_ = 0;
  std::atomic<uint64_t> active_frame_index_{kUnknownFrameIndex};
  std::atomic<uint64_t> active_frame_seq_{0};
  std::atomic<uint64_t> next_frame_seq_{1};
  std::unordered_map<uint64_t, std::unique_ptr<FrameCallbackContext>> frame_contexts_;
  std::atomic<uint64_t> release_seq_{1};

  ~DecodeCallback();
};

/**
 * Unblocks when frame_ready_ is true. packet_ok additionally requires last_hr_ success and pending_.valid — producer
 * should publish those under mu_ before setting frame_ready_ (modes 11/12 deliberately split timing for experiments).
 */
uint64_t DecodeCallback::begin_frame_sequence(uint64_t frame_index) {
  const uint64_t frame_seq = next_frame_seq_.fetch_add(1, std::memory_order_relaxed);
  auto ctx = std::make_unique<FrameCallbackContext>();
  ctx->owner = this;
  ctx->frame_index = frame_index;
  ctx->seq = frame_seq;
  ctx->state = FrameContextState::Scheduled;
  {
    std::lock_guard<std::mutex> lk(mu_);
    frame_contexts_[frame_seq] = std::move(ctx);
  }
  active_frame_seq_.store(frame_seq, std::memory_order_release);
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: frame-seq: created sequence=%llu for frame=%llu tid=%zu\n",
      static_cast<unsigned long long>(frame_seq), static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  return frame_seq;
}

FrameCallbackContext* DecodeCallback::lookup_frame_context_locked(uint64_t frame_seq) {
  const auto it = frame_contexts_.find(frame_seq);
  return it == frame_contexts_.end() ? nullptr : it->second.get();
}

bool DecodeCallback::tag_job_with_frame_sequence(IBlackmagicRawJob* job, uint64_t frame_seq, const char* stage) {
  if (job == nullptr)
    return false;
  FrameCallbackContext* ctx = nullptr;
  {
    std::lock_guard<std::mutex> lk(mu_);
    ctx = lookup_frame_context_locked(frame_seq);
    if (ctx == nullptr)
      return false;
    if (stage != nullptr && std::strcmp(stage, "read") == 0)
      ctx->read_job = job;
    else if (stage != nullptr && std::strcmp(stage, "process") == 0)
      ctx->process_job = job;
  }
  const HRESULT hr = job->SetUserData(static_cast<void*>(ctx));
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: frame-seq: tag %s job with sequence=%llu frame=%llu job=%p hr=0x%08x tid=%zu\n",
      stage != nullptr ? stage : "job", static_cast<unsigned long long>(frame_seq),
      static_cast<unsigned long long>(ctx != nullptr ? ctx->frame_index : kUnknownFrameIndex), static_cast<void*>(job),
      static_cast<unsigned int>(hr), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  return SUCCEEDED(hr);
}

FrameCallbackContext* DecodeCallback::context_from_job(IBlackmagicRawJob* job, const char* stage) {
  if (job == nullptr)
    return nullptr;
  FrameCallbackContext* ctx = nullptr;
  job->GetUserData(reinterpret_cast<void**>(&ctx));
  if (debug_trace_) {
    const uint64_t active_seq = active_frame_seq_.load(std::memory_order_acquire);
    const std::string ctx_seq_label = ctx != nullptr ? std::to_string(ctx->seq) : std::string("none");
    const std::string ctx_frame_label = ctx != nullptr ? frame_index_label(ctx->frame_index) : std::string("unknown");
    const std::string active_seq_label = active_seq != 0 ? std::to_string(active_seq) : std::string("none");
    std::fprintf(stderr,
      "braw-proxy-cli: frame-seq: %s resolved context seq=%s frame=%s job=%p active_seq=%s tid=%zu\n",
      stage != nullptr ? stage : "job", ctx_seq_label.c_str(), ctx_frame_label.c_str(), static_cast<void*>(job),
      active_seq_label.c_str(), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  return ctx;
}

void DecodeCallback::publish_frame_failure_locked(FrameCallbackContext* ctx, HRESULT hr, bool notify) {
  pending_ = FrameHandoffPacket{};
  last_hr_ = hr;
  frame_ready_ = true;
  ready_frame_seq_ = ctx != nullptr ? ctx->seq : 0;
  pending_frame_seq_ = 0;
  deferred_frame_seq_ = 0;
  if (ctx != nullptr)
    ctx->state = FrameContextState::Failed;
  if (notify)
    cv_.notify_one();
}

bool DecodeCallback::wait_processed(uint64_t frame_index, uint64_t frame_seq) {
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: enter wait_processed (frame=%llu seq=%llu timeout_sec=%d tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), handoff_timeout_sec_,
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  std::unique_lock<std::mutex> lk(mu_);
  const bool already_ready = frame_ready_;
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: wait mutex acquired (frame=%llu seq=%llu packet_already_ready=%d ready_seq=%llu valid=%d "
      "hr=0x%08x tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), already_ready ? 1 : 0,
      static_cast<unsigned long long>(ready_frame_seq_), pending_.valid ? 1 : 0, static_cast<unsigned int>(last_hr_),
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  bool woke = false;
  if (handoff_timeout_sec_ <= 0) {
    cv_.wait(lk, [&] { return frame_ready_ && ready_frame_seq_ == frame_seq; });
    woke = frame_ready_ && ready_frame_seq_ == frame_seq;
  } else {
    woke = cv_.wait_for(lk, std::chrono::seconds(handoff_timeout_sec_),
      [&] { return frame_ready_ && ready_frame_seq_ == frame_seq; });
  }
  const bool packet_ok = woke && frame_ready_ && ready_frame_seq_ == frame_seq && SUCCEEDED(last_hr_) && pending_.valid
    && pending_frame_seq_ == frame_seq;
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: wait_processed exit (frame=%llu seq=%llu woke=%d ready=%d ready_seq=%llu pending_seq=%llu "
      "valid=%d hr=0x%08x packet_ok=%d tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), woke ? 1 : 0,
      frame_ready_ ? 1 : 0, static_cast<unsigned long long>(ready_frame_seq_),
      static_cast<unsigned long long>(pending_frame_seq_), pending_.valid ? 1 : 0, static_cast<unsigned int>(last_hr_),
      packet_ok ? 1 : 0, braw_trace_tid_hash());
    std::fflush(stderr);
    std::fprintf(stderr,
      "braw-proxy-cli: trace: consumer wake detail (timed_wait=%s)\n",
      handoff_timeout_sec_ <= 0 ? "off" : "on");
    std::fflush(stderr);
  }
  if (debug_trace_ && woke && frame_ready_) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] wait_processed: woke (frame_ready=1 last_hr=0x%08x valid=%d tid=%zu)\n",
      static_cast<unsigned int>(last_hr_), static_cast<int>(pending_.valid), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  return packet_ok;
}

DecodeCallback::~DecodeCallback() {
  if (debug_trace_) {
    std::fprintf(stderr, "braw-proxy-cli: DecodeCallback::~DecodeCallback (tid=%zu)\n", braw_trace_tid_hash());
    std::fflush(stderr);
    std::fprintf(stderr, "braw-proxy-cli: frame-track: destructor active_frame=%s tid=%zu\n",
      frame_index_label(active_frame_index_.load(std::memory_order_acquire)).c_str(), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  IBlackmagicRawJob* j = nullptr;
  IBlackmagicRawProcessedImage* im = nullptr;
  {
    std::lock_guard<std::mutex> lk(mu_);
    j = deferred_process_job_;
    im = deferred_process_image_;
    deferred_process_job_ = nullptr;
    deferred_process_image_ = nullptr;
  }
  release_bmd_deferred_sdk_pair(j, im, "~DecodeCallback");
}

void DecodeCallback::set_active_frame_index(uint64_t frame_index) {
  active_frame_index_.store(frame_index, std::memory_order_release);
  if (debug_trace_) {
    const std::string frame_label = frame_index_label(frame_index);
    std::fprintf(stderr,
      "braw-proxy-cli: frame-track: set active_frame=%s tid=%zu\n", frame_label.c_str(), braw_trace_tid_hash());
    std::fflush(stderr);
  }
}

uint64_t DecodeCallback::next_release_seq() { return release_seq_.fetch_add(1, std::memory_order_relaxed); }

void DecodeCallback::reset_wait() {
  /** Per-iteration boundary: clears prior frame_ready_/pending_ so wait_processed cannot see stale readiness. */
  IBlackmagicRawJob* j = nullptr;
  IBlackmagicRawProcessedImage* im = nullptr;
  const uint64_t active_frame = active_frame_index_.load(std::memory_order_acquire);
  {
    std::lock_guard<std::mutex> lk(mu_);
    if (debug_trace_) {
      std::fprintf(stderr,
        "braw-proxy-cli: producer: reset_wait — clear pending (active_frame=%s active_seq=%llu ready_seq=%llu had_pixels=%zu "
        "valid=%d) steal deferred job=%p img=%p (tid=%zu)\n",
        frame_index_label(active_frame).c_str(),
        static_cast<unsigned long long>(active_frame_seq_.load(std::memory_order_acquire)),
        static_cast<unsigned long long>(ready_frame_seq_), pending_.pixels.size(), pending_.valid ? 1 : 0,
        static_cast<void*>(deferred_process_job_), static_cast<void*>(deferred_process_image_), braw_trace_tid_hash());
      std::fprintf(stderr, "[ffmpeg-braw trace] reset_wait: steal deferred + clear pending (tid=%zu)\n",
        braw_trace_tid_hash());
      std::fflush(stderr);
    }
    j = deferred_process_job_;
    im = deferred_process_image_;
    deferred_process_job_ = nullptr;
    deferred_process_image_ = nullptr;
    pending_ = FrameHandoffPacket{};
    frame_ready_ = false;
    last_hr_ = S_OK;
    ready_frame_seq_ = 0;
    pending_frame_seq_ = 0;
    deferred_frame_seq_ = 0;
  }
  release_bmd_deferred_sdk_pair(j, im, "reset_wait(between frames)");
}

void DecodeCallback::finish_frame_sequence(uint64_t frame_seq, uint64_t frame_index) {
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: frame-seq: finish sequence=%llu frame=%llu tid=%zu\n",
      static_cast<unsigned long long>(frame_seq), static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  uint64_t expected_seq = frame_seq;
  active_frame_seq_.compare_exchange_strong(expected_seq, 0, std::memory_order_acq_rel);
  active_frame_index_.store(kUnknownFrameIndex, std::memory_order_release);
  {
    std::lock_guard<std::mutex> lk(mu_);
    if (auto* ctx = lookup_frame_context_locked(frame_seq))
      ctx->state = FrameContextState::Consumed;
  }
}

void DecodeCallback::release_deferred_process_sdk_main() {
  IBlackmagicRawJob* j = nullptr;
  IBlackmagicRawProcessedImage* im = nullptr;
  {
    std::lock_guard<std::mutex> lk(mu_);
    j = deferred_process_job_;
    im = deferred_process_image_;
    deferred_process_job_ = nullptr;
    deferred_process_image_ = nullptr;
    deferred_frame_seq_ = 0;
  }
  release_bmd_deferred_sdk_pair(j, im, "wait_processed failed cleanup");
}

void DecodeCallback::scrub_after_on_frame(uint64_t frame_index) {
  std::lock_guard<std::mutex> lk(mu_);
  if (debug_trace_) {
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: scrub_after_on_frame enter (frame=%llu ready=%d valid=%d hr=0x%08x pending_bytes=%zu "
      "w=%u h=%u row=%u deferred_job=%p deferred_img=%p tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), frame_ready_ ? 1 : 0, pending_.valid ? 1 : 0,
      static_cast<unsigned int>(last_hr_), pending_.pixels.size(), pending_.w, pending_.h, pending_.row_bytes,
      static_cast<void*>(deferred_process_job_), static_cast<void*>(deferred_process_image_), braw_trace_tid_hash());
  }
  pending_ = FrameHandoffPacket{};
  frame_ready_ = false;
  last_hr_ = S_OK;
  ready_frame_seq_ = 0;
  pending_frame_seq_ = 0;
  deferred_frame_seq_ = 0;
  if (debug_trace_) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] scrub_after_on_frame: cleared pending/frame_ready/last_hr after on_frame (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
    std::fflush(stderr);
  }
}

bool DecodeCallback::take_completed_frame(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w, uint32_t& h,
  uint64_t frame_index, uint64_t frame_seq) {
  IBlackmagicRawJob* rel_j = nullptr;
  IBlackmagicRawProcessedImage* rel_im = nullptr;
  bool ok = false;

  {
    std::lock_guard<std::mutex> lk(mu_);
    if (debug_trace_) {
      std::fprintf(stderr, "braw-proxy-cli: consumer: dequeue enter (frame=%llu seq=%llu tid=%zu)\n",
        static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), braw_trace_tid_hash());
      std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: enter (tid=%zu)\n", braw_trace_tid_hash());
      std::fflush(stderr);
    }
    if (!frame_ready_ || ready_frame_seq_ != frame_seq) {
      std::fprintf(stderr,
        "braw-proxy-cli: consumer: dequeue abort !frame_ready_or_seq_mismatch (frame=%llu seq=%llu ready=%d ready_seq=%llu)\n",
        static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), frame_ready_ ? 1 : 0,
        static_cast<unsigned long long>(ready_frame_seq_));
      std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: !frame_ready_\n");
      std::fflush(stderr);
      return false;
    }
    if (!SUCCEEDED(last_hr_) || !pending_.valid || pending_frame_seq_ != frame_seq) {
      std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: bad packet (last_hr=0x%08x valid=%d)\n",
        static_cast<unsigned int>(last_hr_), static_cast<int>(pending_.valid));
      std::fflush(stderr);
      if (deferred_frame_seq_ == frame_seq) {
        rel_j = deferred_process_job_;
        rel_im = deferred_process_image_;
        deferred_process_job_ = nullptr;
        deferred_process_image_ = nullptr;
        deferred_frame_seq_ = 0;
      }
      pending_ = FrameHandoffPacket{};
      ready_frame_seq_ = 0;
      pending_frame_seq_ = 0;
      frame_ready_ = false;
    } else {
      const size_t psz = pending_.pixels.size();
      if (debug_trace_) {
        std::fprintf(stderr,
          "braw-proxy-cli: consumer: pending packet before move data=%p size=%zu capacity=%zu (frame=%llu tid=%zu)\n",
          pending_.pixels.empty() ? nullptr : static_cast<void*>(pending_.pixels.data()), psz, pending_.pixels.capacity(),
          static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
        std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: before move (pending_pixels=%zu tid=%zu)\n", psz,
          braw_trace_tid_hash());
        std::fflush(stderr);
      }
      row_bytes = pending_.row_bytes;
      w = pending_.w;
      h = pending_.h;
      const size_t expect = static_cast<size_t>(row_bytes) * static_cast<size_t>(h);
      if (expect != pending_.pixels.size()) {
        std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: size mismatch expect=%zu got=%zu\n", expect,
          pending_.pixels.size());
        std::fflush(stderr);
        if (deferred_frame_seq_ == frame_seq) {
          rel_j = deferred_process_job_;
          rel_im = deferred_process_image_;
          deferred_process_job_ = nullptr;
          deferred_process_image_ = nullptr;
          deferred_frame_seq_ = 0;
        }
        pending_ = FrameHandoffPacket{};
        ready_frame_seq_ = 0;
        pending_frame_seq_ = 0;
        frame_ready_ = false;
      } else {
        const int che = consumer_handoff_experiment_;
        const void* const owned_obj_before = static_cast<const void*>(&owned);
        if (debug_trace_) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] handoff-instrument: take_completed_frame owned packet object before transfer "
            "frame=%llu &owned=%p tid=%zu\n",
            static_cast<unsigned long long>(frame_index), owned_obj_before, braw_trace_tid_hash());
          std::fflush(stderr);
        }

        if (fresh_owned_per_frame_) {
          if (debug_trace_) {
            std::fprintf(stderr,
              "[ffmpeg-braw trace] take_completed_frame: exclusive pixel buffer path (frame=%llu pending_valid=%d "
              "tid=%zu)\n",
              static_cast<unsigned long long>(frame_index), pending_.valid ? 1 : 0, braw_trace_tid_hash());
            std::fflush(stderr);
          }
          const bool pkt_valid = pending_.valid;
          std::vector<uint8_t> fresh(pending_.pixels.size());
          if (!fresh.empty())
            std::memcpy(fresh.data(), pending_.pixels.data(), fresh.size());
          owned = std::move(fresh);
          void* const od = owned.empty() ? nullptr : static_cast<void*>(owned.data());
          const bool same_data_as_prev =
            (fresh_owned_prev_data_ != nullptr && od != nullptr && od == fresh_owned_prev_data_);
          const bool same_cap_as_prev =
            (fresh_owned_prev_cap_ != 0u && owned.capacity() == fresh_owned_prev_cap_);
          if (debug_trace_) {
            std::fprintf(stderr,
              "[ffmpeg-braw trace] handoff-instrument: exclusive buffer allocated for frame=%llu data=%p size=%zu cap=%zu "
              "pending_valid=%d same_heap_data_ptr_as_prev=%d same_cap_as_prev=%d tid=%zu\n",
              static_cast<unsigned long long>(frame_index), od, owned.size(), owned.capacity(), pkt_valid ? 1 : 0,
              same_data_as_prev ? 1 : 0, same_cap_as_prev ? 1 : 0, braw_trace_tid_hash());
            std::fflush(stderr);
            if (frame_index > 0 && (same_data_as_prev || same_cap_as_prev)) {
              std::fprintf(stderr,
                "[ffmpeg-braw trace] handoff-instrument: note: matching data pointer or capacity vs previous frame is "
                "often heap allocator reuse, not the same std::vector object retained across frames\n");
              std::fflush(stderr);
            }
            std::fprintf(stderr,
              "[ffmpeg-braw trace] handoff-instrument: exclusive-buffer post-assign &owned=%p owned.data=%p size=%zu "
              "cap=%zu prev_data=%p prev_cap=%zu tid=%zu\n",
              static_cast<const void*>(&owned), od, owned.size(), owned.capacity(), fresh_owned_prev_data_,
              fresh_owned_prev_cap_, braw_trace_tid_hash());
            std::fflush(stderr);
          }
          fresh_owned_prev_data_ = od;
          fresh_owned_prev_cap_ = owned.capacity();
        } else {
          const bool use_copy = handoff_copy_pixels_ || che == 2;
          void* const pre_pending_data = pending_.pixels.empty() ? nullptr : static_cast<void*>(pending_.pixels.data());
          const size_t pre_pending_size = pending_.pixels.size();
          const size_t pre_pending_cap = pending_.pixels.capacity();

          if (debug_trace_) {
            std::fprintf(stderr,
              "[ffmpeg-braw trace] handoff-instrument: before transfer frame=%llu use_copy=%d pre_pending data=%p "
              "size=%zu cap=%zu tid=%zu\n",
              static_cast<unsigned long long>(frame_index), use_copy ? 1 : 0, pre_pending_data, pre_pending_size,
              pre_pending_cap, braw_trace_tid_hash());
            std::fflush(stderr);
          }

          if (use_copy) {
            owned = pending_.pixels;
            if (debug_trace_) {
              if (che == 2) {
                std::fprintf(stderr,
                  "[ffmpeg-braw trace] take_completed_frame: consumer bisect-2 — copy (also: handoff_copy_pixels=%d) "
                  "(tid=%zu)\n",
                  handoff_copy_pixels_ ? 1 : 0, braw_trace_tid_hash());
              } else {
                std::fprintf(stderr,
                  "[ffmpeg-braw trace] take_completed_frame: packet copied to owner (handoff_copy_pixels default path) "
                  "(tid=%zu)\n",
                  braw_trace_tid_hash());
              }
              std::fflush(stderr);
            }
          } else {
            owned = std::move(pending_.pixels);
            if (debug_trace_) {
              std::fprintf(stderr,
                "[ffmpeg-braw trace] take_completed_frame: packet moved to owner (--handoff-move-pixels; bisect move path) "
                "(tid=%zu)\n",
                braw_trace_tid_hash());
              std::fflush(stderr);
            }
          }

          if (debug_trace_) {
            void* const post_pending_data =
              pending_.pixels.empty() ? nullptr : static_cast<void*>(pending_.pixels.data());
            void* const owned_data = owned.empty() ? nullptr : static_cast<void*>(owned.data());
            const bool alias_after = (pre_pending_data != nullptr && owned_data == pre_pending_data);
            std::fprintf(stderr,
              "[ffmpeg-braw trace] handoff-instrument: after transfer (before pending_={}) pending.size=%zu pending.cap=%zu "
              "pending.data=%p owned.data=%p owned.size=%zu owned.cap=%zu data_alias_pre_pending=%d tid=%zu\n",
              pending_.pixels.size(), pending_.pixels.capacity(), post_pending_data, owned_data, owned.size(),
              owned.capacity(), alias_after ? 1 : 0, braw_trace_tid_hash());
            std::fflush(stderr);
          }
        }

        if (debug_trace_) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] handoff-instrument: take_completed_frame owned packet object after transfer "
            "frame=%llu &owned=%p (same slot as before=%d) tid=%zu\n",
            static_cast<unsigned long long>(frame_index), static_cast<const void*>(&owned),
            (static_cast<const void*>(&owned) == owned_obj_before) ? 1 : 0, braw_trace_tid_hash());
          std::fflush(stderr);
        }

        pending_ = FrameHandoffPacket{};
        ready_frame_seq_ = 0;
        pending_frame_seq_ = 0;

        if (debug_trace_) {
          void* const owned_after_clear_pending = owned.empty() ? nullptr : static_cast<void*>(owned.data());
          std::fprintf(stderr,
            "[ffmpeg-braw trace] handoff-instrument: after pending_={} owned.data=%p size=%zu cap=%zu (must still own "
            "buffer) tid=%zu\n",
            owned_after_clear_pending, owned.size(), owned.capacity(), braw_trace_tid_hash());
          std::fflush(stderr);
        }

        if (che == 3) {
          if (debug_trace_) {
            std::fprintf(stderr,
              "[ffmpeg-braw trace] take_completed_frame: consumer bisect-3 — leaving frame_ready_=true until next "
              "reset_wait (tid=%zu)\n",
              braw_trace_tid_hash());
            std::fflush(stderr);
          }
        } else {
          frame_ready_ = false;
        }
        if (deferred_frame_seq_ == frame_seq) {
          rel_j = deferred_process_job_;
          rel_im = deferred_process_image_;
          deferred_process_job_ = nullptr;
          deferred_process_image_ = nullptr;
          deferred_frame_seq_ = 0;
        }
        if (auto* ctx = lookup_frame_context_locked(frame_seq))
          ctx->state = FrameContextState::Dequeued;
        ok = true;
        if (debug_trace_) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] take_completed_frame: deferred slots nulled under mu_ (job was=%p img was=%p tid=%zu)\n",
            static_cast<void*>(rel_j), static_cast<void*>(rel_im), braw_trace_tid_hash());
          std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame: after transfer/clear (owned=%zu tid=%zu)\n",
            owned.size(), braw_trace_tid_hash());
          std::fprintf(stderr,
            "braw-proxy-cli: consumer: dequeue OK (frame=%llu seq=%llu bytes=%zu w=%u h=%u row_bytes=%u owned.data=%p "
            "owned.cap=%zu tid=%zu)\n",
            static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), owned.size(), w, h, row_bytes,
            owned.empty() ? nullptr : static_cast<void*>(owned.data()), owned.capacity(), braw_trace_tid_hash());
          std::fprintf(stderr,
            "braw-proxy-cli: trace: packet dequeue (bytes=%zu w=%u h=%u row_bytes=%u)\n", owned.size(), w, h,
            row_bytes);
          std::fflush(stderr);
        }
      }
    }
  }

  if (ok && debug_trace_) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] handoff-instrument: post-mutex pre-SDK-Release owned.data=%p size=%zu cap=%zu tid=%zu\n",
      owned.empty() ? nullptr : static_cast<void*>(owned.data()), owned.size(), owned.capacity(), braw_trace_tid_hash());
    std::fflush(stderr);
  }

  if (debug_trace_) {
    if (rel_j != nullptr || rel_im != nullptr) {
      std::fprintf(stderr,
        "braw-proxy-cli: consumer: main deferred COM drain begin (frame=%llu seq=%llu job=%p img=%p tid=%zu)\n",
        static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq),
        static_cast<void*>(rel_j), static_cast<void*>(rel_im), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: take_completed_frame Release step (frame=%llu seq=%llu ok=%d deferred img=%p job=%p tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), ok ? 1 : 0,
      static_cast<void*>(rel_im), static_cast<void*>(rel_j),
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  release_bmd_deferred_sdk_pair(rel_j, rel_im,
    ok ? "main after packet consumed (before on_frame / next SDK call)" : "main take_completed_frame error path");
  if (debug_trace_ && ok) {
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: main deferred COM drain complete (callback deferred_job/img members cleared under mu_; "
      "released pair on main tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  if (ok) {
    if (debug_trace_) {
      std::fprintf(stderr,
        "[ffmpeg-braw trace] take_completed_frame: SDK deferred pair released on main; members already null (tid=%zu)\n",
        braw_trace_tid_hash());
      std::fprintf(stderr,
        "[ffmpeg-braw trace] handoff-instrument: post-SDK-Release owned.data=%p size=%zu cap=%zu (stable for on_frame) "
        "tid=%zu\n",
        owned.empty() ? nullptr : static_cast<void*>(owned.data()), owned.size(), owned.capacity(), braw_trace_tid_hash());
      std::fflush(stderr);
    }
  } else {
    std::fprintf(stderr, "braw-proxy-cli: consumer: dequeue FAILED (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
    std::fflush(stderr);
  }
  return ok;
}

bool DecodeCallback::take_completed_frame_production_fresh(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w,
  uint32_t& h, uint64_t frame_index, uint64_t frame_seq) {
  IBlackmagicRawJob* rel_j = nullptr;
  IBlackmagicRawProcessedImage* rel_im = nullptr;
  bool ok = false;

  {
    std::lock_guard<std::mutex> lk(mu_);
    if (debug_trace_) {
      std::fprintf(stderr,
        "braw-proxy-cli: consumer: production: take_completed_frame_production_fresh enter (frame=%llu seq=%llu tid=%zu)\n",
        static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    if (!frame_ready_ || ready_frame_seq_ != frame_seq) {
      std::fprintf(stderr,
        "braw-proxy-cli: consumer: dequeue abort !frame_ready_or_seq_mismatch (frame=%llu seq=%llu ready=%d ready_seq=%llu)\n",
        static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), frame_ready_ ? 1 : 0,
        static_cast<unsigned long long>(ready_frame_seq_));
      std::fprintf(stderr, "[ffmpeg-braw trace] take_completed_frame_production_fresh: !frame_ready_\n");
      std::fflush(stderr);
      return false;
    }
    if (!SUCCEEDED(last_hr_) || !pending_.valid || pending_frame_seq_ != frame_seq) {
      std::fprintf(stderr,
        "[ffmpeg-braw trace] take_completed_frame_production_fresh: bad packet (last_hr=0x%08x valid=%d)\n",
        static_cast<unsigned int>(last_hr_), static_cast<int>(pending_.valid));
      std::fflush(stderr);
      if (deferred_frame_seq_ == frame_seq) {
        rel_j = deferred_process_job_;
        rel_im = deferred_process_image_;
        deferred_process_job_ = nullptr;
        deferred_process_image_ = nullptr;
        deferred_frame_seq_ = 0;
      }
      pending_ = FrameHandoffPacket{};
      ready_frame_seq_ = 0;
      pending_frame_seq_ = 0;
      frame_ready_ = false;
    } else {
      if (debug_trace_) {
        const size_t psz = pending_.pixels.size();
        std::fprintf(stderr,
          "[ffmpeg-braw trace] take_completed_frame_production_fresh: pending_pixels=%zu (frame=%llu tid=%zu)\n", psz,
          static_cast<unsigned long long>(frame_index), braw_trace_tid_hash());
        std::fflush(stderr);
      }
      row_bytes = pending_.row_bytes;
      w = pending_.w;
      h = pending_.h;
      const size_t expect = static_cast<size_t>(row_bytes) * static_cast<size_t>(h);
      if (expect != pending_.pixels.size()) {
        std::fprintf(stderr,
          "[ffmpeg-braw trace] take_completed_frame_production_fresh: size mismatch expect=%zu got=%zu\n", expect,
          pending_.pixels.size());
        std::fflush(stderr);
        if (deferred_frame_seq_ == frame_seq) {
          rel_j = deferred_process_job_;
          rel_im = deferred_process_image_;
          deferred_process_job_ = nullptr;
          deferred_process_image_ = nullptr;
          deferred_frame_seq_ = 0;
        }
        pending_ = FrameHandoffPacket{};
        ready_frame_seq_ = 0;
        pending_frame_seq_ = 0;
        frame_ready_ = false;
      } else {
        const int che = consumer_handoff_experiment_;
        const void* const owned_obj_before = static_cast<const void*>(&owned);
        if (debug_trace_) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] handoff-instrument: production_fresh before transfer frame=%llu &owned=%p tid=%zu\n",
            static_cast<unsigned long long>(frame_index), owned_obj_before, braw_trace_tid_hash());
          std::fflush(stderr);
        }

        /** Literal known-good transfer: new std::vector + memcpy only (no assignment from pending into caller storage). */
        const bool pkt_valid = pending_.valid;
        std::vector<uint8_t> fresh(pending_.pixels.size());
        if (!fresh.empty())
          std::memcpy(fresh.data(), pending_.pixels.data(), fresh.size());
        owned = std::move(fresh);
        void* const od = owned.empty() ? nullptr : static_cast<void*>(owned.data());
        if (debug_trace_) {
          std::fprintf(stderr,
            "braw-proxy-cli: consumer: production: new exclusive pixel std::vector for frame=%llu data=%p byte_size=%zu "
            "cap=%zu pending_valid=%d tid=%zu\n",
            static_cast<unsigned long long>(frame_index), od, owned.size(), owned.capacity(), pkt_valid ? 1 : 0,
            braw_trace_tid_hash());
          std::fflush(stderr);
        }
        const bool same_data_as_prev =
          (fresh_owned_prev_data_ != nullptr && od != nullptr && od == fresh_owned_prev_data_);
        const bool same_cap_as_prev = (fresh_owned_prev_cap_ != 0u && owned.capacity() == fresh_owned_prev_cap_);
        if (debug_trace_) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] handoff-instrument: production_fresh post-assign &owned=%p owned.data=%p size=%zu cap=%zu "
            "same_heap_data_ptr_as_prev=%d same_cap_as_prev=%d tid=%zu\n",
            static_cast<const void*>(&owned), od, owned.size(), owned.capacity(), same_data_as_prev ? 1 : 0,
            same_cap_as_prev ? 1 : 0, braw_trace_tid_hash());
          if (frame_index > 0 && (same_data_as_prev || same_cap_as_prev)) {
            std::fprintf(stderr,
              "[ffmpeg-braw trace] handoff-instrument: note: matching data/cap vs previous frame is often allocator reuse\n");
          }
          std::fflush(stderr);
        }
        fresh_owned_prev_data_ = od;
        fresh_owned_prev_cap_ = owned.capacity();

        if (debug_trace_) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] handoff-instrument: production_fresh owned packet after transfer frame=%llu &owned=%p "
            "(same slot as before=%d) tid=%zu\n",
            static_cast<unsigned long long>(frame_index), static_cast<const void*>(&owned),
            (static_cast<const void*>(&owned) == owned_obj_before) ? 1 : 0, braw_trace_tid_hash());
          std::fflush(stderr);
        }

        pending_ = FrameHandoffPacket{};
        ready_frame_seq_ = 0;
        pending_frame_seq_ = 0;

        if (debug_trace_) {
          void* const owned_after_clear_pending = owned.empty() ? nullptr : static_cast<void*>(owned.data());
          std::fprintf(stderr,
            "[ffmpeg-braw trace] handoff-instrument: production_fresh after pending_={} owned.data=%p size=%zu cap=%zu "
            "tid=%zu\n",
            owned_after_clear_pending, owned.size(), owned.capacity(), braw_trace_tid_hash());
          std::fflush(stderr);
        }

        if (che == 3) {
          if (debug_trace_) {
            std::fprintf(stderr,
              "[ffmpeg-braw trace] take_completed_frame_production_fresh: bisect-3 — leaving frame_ready_=true until next "
              "reset_wait (tid=%zu)\n",
              braw_trace_tid_hash());
            std::fflush(stderr);
          }
        } else {
          frame_ready_ = false;
        }
        if (deferred_frame_seq_ == frame_seq) {
          rel_j = deferred_process_job_;
          rel_im = deferred_process_image_;
          deferred_process_job_ = nullptr;
          deferred_process_image_ = nullptr;
          deferred_frame_seq_ = 0;
        }
        if (auto* ctx = lookup_frame_context_locked(frame_seq))
          ctx->state = FrameContextState::Dequeued;
        ok = true;
        if (debug_trace_) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] take_completed_frame_production_fresh: deferred nulled (job=%p img=%p tid=%zu)\n",
            static_cast<void*>(rel_j), static_cast<void*>(rel_im), braw_trace_tid_hash());
          std::fprintf(stderr,
            "braw-proxy-cli: consumer: production: dequeue OK (frame=%llu seq=%llu bytes=%zu w=%u h=%u row_bytes=%u data=%p "
            "tid=%zu)\n",
            static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), owned.size(), w, h, row_bytes,
            owned.empty() ? nullptr : static_cast<void*>(owned.data()), braw_trace_tid_hash());
          std::fflush(stderr);
        }
      }
    }
  }

  if (ok && debug_trace_) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] handoff-instrument: production_fresh post-mutex pre-SDK-Release data=%p size=%zu tid=%zu\n",
      owned.empty() ? nullptr : static_cast<void*>(owned.data()), owned.size(), braw_trace_tid_hash());
    std::fflush(stderr);
  }

  if (debug_trace_) {
    if (rel_j != nullptr || rel_im != nullptr) {
      std::fprintf(stderr,
        "braw-proxy-cli: consumer: main deferred COM drain begin (production_fresh frame=%llu seq=%llu job=%p img=%p "
        "tid=%zu)\n",
        static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq),
        static_cast<void*>(rel_j), static_cast<void*>(rel_im), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: production: Release step (frame=%llu seq=%llu ok=%d img=%p job=%p tid=%zu)\n",
      static_cast<unsigned long long>(frame_index), static_cast<unsigned long long>(frame_seq), ok ? 1 : 0,
      static_cast<void*>(rel_im), static_cast<void*>(rel_j),
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  release_bmd_deferred_sdk_pair(rel_j, rel_im,
    ok ? "main after packet consumed (production_fresh before on_frame)" : "main take_completed_frame_production_fresh error");
  if (debug_trace_ && ok) {
    std::fprintf(stderr,
      "braw-proxy-cli: consumer: main deferred COM drain complete (production_fresh tid=%zu)\n", braw_trace_tid_hash());
    std::fflush(stderr);
  }
  if (ok) {
    if (debug_trace_) {
      std::fprintf(stderr,
        "[ffmpeg-braw trace] take_completed_frame_production_fresh: SDK deferred released on main (tid=%zu)\n",
        braw_trace_tid_hash());
      std::fprintf(stderr,
        "[ffmpeg-braw trace] handoff-instrument: production_fresh post-SDK-Release data=%p size=%zu tid=%zu\n",
        owned.empty() ? nullptr : static_cast<void*>(owned.data()), owned.size(), braw_trace_tid_hash());
      std::fflush(stderr);
    }
  } else {
    std::fprintf(stderr, "braw-proxy-cli: consumer: production: dequeue FAILED (frame=%llu tid=%zu)\n",
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
  FrameCallbackContext* ctx = context_from_job(readJob, "ReadComplete");
  const uint64_t frame_index = ctx != nullptr ? ctx->frame_index : kUnknownFrameIndex;
  const uint64_t frame_seq = ctx != nullptr ? ctx->seq : 0;
  const uint64_t active_seq = active_frame_seq_.load(std::memory_order_acquire);
  const std::string frame_seq_label = frame_seq != 0 ? std::to_string(frame_seq) : std::string("none");
  const std::string active_seq_label = active_seq != 0 ? std::to_string(active_seq) : std::string("none");
  std::fprintf(stderr,
    "braw-proxy-cli: frame-track: ReadComplete sees frame=%s seq=%s readJob=%p active_frame=%s active_seq=%s tid=%zu\n",
    frame_index_label(frame_index).c_str(), frame_seq_label.c_str(), static_cast<void*>(readJob),
    frame_index_label(active_frame_index_.load(std::memory_order_acquire)).c_str(), active_seq_label.c_str(),
    braw_trace_tid_hash());
  std::fflush(stderr);
  if (ctx != nullptr) {
    std::lock_guard<std::mutex> lk(mu_);
    ctx->state = FrameContextState::ReadCompleteEntered;
    if (active_seq != 0 && ctx->seq != active_seq) {
      ctx->stale = true;
      ctx->state = FrameContextState::StaleIgnored;
      std::fprintf(stderr,
        "braw-proxy-cli: frame-seq: stale ReadComplete ignored frame=%s seq=%llu active_seq=%llu readJob=%p tid=%zu\n",
        frame_index_label(ctx->frame_index).c_str(), static_cast<unsigned long long>(ctx->seq),
        static_cast<unsigned long long>(active_seq), static_cast<void*>(readJob), braw_trace_tid_hash());
      std::fflush(stderr);
    }
  }
  if (ctx != nullptr && ctx->stale) {
    safe_release(frame);
    safe_release(readJob);
    return;
  }
  if (readJob == nullptr || frame == nullptr) {
    if (readJob)
      readJob->Release();
    safe_release(frame);
    std::lock_guard<std::mutex> lk(mu_);
    publish_frame_failure_locked(ctx, E_POINTER, true);
    return;
  }

  if (FAILED(result)) {
    readJob->Release();
    std::lock_guard<std::mutex> lk(mu_);
    publish_frame_failure_locked(ctx, result, true);
    return;
  }

  HRESULT hr = S_OK;
  IBlackmagicRawFrameProcessingAttributes* frameAttr = nullptr;
  hr = frame->CloneFrameProcessingAttributes(&frameAttr);
  if (FAILED(hr) || frameAttr == nullptr) {
    safe_release(frame);
    readJob->Release();
    std::lock_guard<std::mutex> lk(mu_);
    publish_frame_failure_locked(ctx, FAILED(hr) ? hr : E_FAIL, true);
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
    std::lock_guard<std::mutex> lk(mu_);
    publish_frame_failure_locked(ctx, FAILED(hr) ? hr : E_FAIL, true);
    return;
  }

  if (!tag_job_with_frame_sequence(decodeAndProcessJob, frame_seq, "process")) {
    safe_release(decodeAndProcessJob);
    safe_release(frame);
    readJob->Release();
    std::lock_guard<std::mutex> lk(mu_);
    publish_frame_failure_locked(ctx, E_FAIL, true);
    return;
  }

  /**
   * SetUserData stores only a raw pointer. Keep the callback alive until ProcessComplete finishes for this job.
   */
  const ULONG callback_ref_after_job_hold = AddRef();
  std::fprintf(stderr,
    "[ffmpeg-braw trace] ReadComplete: callback AddRef for process job (frame=%s seq=%llu ref=%lu tid=%zu)\n",
    frame_index_label(frame_index).c_str(), static_cast<unsigned long long>(frame_seq),
    static_cast<unsigned long>(callback_ref_after_job_hold), braw_trace_tid_hash());
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
      "[ffmpeg-braw trace] ReadComplete: callback Release after failed Submit (frame=%s seq=%llu ref=%lu tid=%zu)\n",
      frame_index_label(frame_index).c_str(), static_cast<unsigned long long>(frame_seq),
      static_cast<unsigned long>(callback_ref_after_submit_fail), braw_trace_tid_hash());
    std::fflush(stderr);
    safe_release(decodeAndProcessJob);
    std::lock_guard<std::mutex> lk(mu_);
    publish_frame_failure_locked(ctx, hr, true);
    return;
  }

  std::fprintf(stderr,
    "[ffmpeg-braw trace] process pipeline queued (await ProcessComplete frame=%s seq=%llu processJob=%p)\n",
    frame_index_label(frame_index).c_str(), static_cast<unsigned long long>(frame_seq),
    static_cast<void*>(decodeAndProcessJob));
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

  FrameCallbackContext* ctx = rel_job != nullptr ? context_from_job(rel_job, "ProcessComplete") : nullptr;
  DecodeCallback* self = ctx != nullptr ? ctx->owner : nullptr;
  const uint64_t frame_seq = ctx != nullptr ? ctx->seq : 0;
  uint64_t frame_index = ctx != nullptr ? ctx->frame_index : kUnknownFrameIndex;
  const auto release_job_callback_ref = [&]() {
    if (self != nullptr) {
      const ULONG callback_ref_after_job_release = self->Release();
      std::fprintf(stderr,
        "[ffmpeg-braw trace] ProcessComplete: callback Release after async job completion (frame=%s seq=%llu ref=%lu tid=%zu)\n",
        frame_index_label(frame_index).c_str(), static_cast<unsigned long long>(frame_seq),
        static_cast<unsigned long>(callback_ref_after_job_release), braw_trace_tid_hash());
      std::fflush(stderr);
      self = nullptr;
    }
  };
  if (self != nullptr) {
    bool pending_valid = false;
    IBlackmagicRawJob* deferred_job = nullptr;
    IBlackmagicRawProcessedImage* deferred_img = nullptr;
    const uint64_t active_seq = self->active_frame_seq_.load(std::memory_order_acquire);
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      ctx->state = FrameContextState::ProcessCompleteEntered;
      ctx->process_job = rel_job;
      ctx->processed_image = rel_img;
      pending_valid = self->pending_.valid;
      deferred_job = self->deferred_process_job_;
      deferred_img = self->deferred_process_image_;
      if (active_seq != 0 && ctx->seq != active_seq) {
        ctx->stale = true;
        ctx->state = FrameContextState::StaleIgnored;
      }
    }
    std::fprintf(stderr,
      "braw-proxy-cli: producer: ProcessComplete state entry frame=%s seq=%llu pending_valid=%d deferred_job=%p "
      "deferred_img=%p processJob=%p processedImage=%p tid=%zu\n",
      frame_index_label(frame_index).c_str(), static_cast<unsigned long long>(frame_seq), pending_valid ? 1 : 0,
      static_cast<void*>(deferred_job), static_cast<void*>(deferred_img), static_cast<void*>(rel_job),
      static_cast<void*>(rel_img), braw_trace_tid_hash());
    std::fflush(stderr);
    if (ctx->stale) {
      std::fprintf(stderr,
        "braw-proxy-cli: frame-seq: stale ProcessComplete ignored frame=%s seq=%llu active_seq=%llu job=%p img=%p tid=%zu\n",
        frame_index_label(frame_index).c_str(), static_cast<unsigned long long>(frame_seq),
        static_cast<unsigned long long>(active_seq), static_cast<void*>(rel_job), static_cast<void*>(rel_img),
        braw_trace_tid_hash());
      std::fflush(stderr);
      release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(stale callback ignored)", frame_index,
        self->next_release_seq());
      return_path = "stale ProcessComplete ignored";
      release_job_callback_ref();
      return;
    }
  }

  if (self == nullptr || rel_job == nullptr || rel_img == nullptr) {
    if (self != nullptr) {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->publish_frame_failure_locked(ctx, E_POINTER, true);
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
      self->publish_frame_failure_locked(ctx, result, true);
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
      self->publish_frame_failure_locked(ctx, FAILED(hr) ? hr : E_FAIL, true);
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
      self->publish_frame_failure_locked(ctx, E_FAIL, true);
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
      self->publish_frame_failure_locked(ctx, E_FAIL, true);
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
      self->publish_frame_failure_locked(ctx, E_FAIL, true);
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

  if (self->process_complete_experiment_ == 1) {
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

  const int pce = self->process_complete_experiment_;
  const bool notify_consumers = (pce == 0 || pce == 4);
  const bool defer_com = self->defer_success_release_to_main_ && pce == 0;
  const bool publish_bisect_no_notify =
    (pce == 3 || (pce >= 5 && pce <= 10) || pce == 11 || pce == 12);

  if (pce == 2) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: bisect-2 — copy only; no publish/notify; immediate callback-thread COM "
      "release (frame=%s plane_bytes=%zu tid=%zu)\n",
      frame_label.c_str(), plane_bytes, braw_trace_tid_hash());
    std::fflush(stderr);
    const char* ctx2 = same_identity ? "ProcessComplete(bisect-2 copy-only job Release only)"
                                     : "ProcessComplete(bisect-2 copy-only image then job Release)";
    if (same_identity)
      release_bmd_sdk_pair_logged(job, nullptr, ctx2, frame_index, self->next_release_seq());
    else
      release_bmd_sdk_pair_logged(job, processedImage, ctx2, frame_index, self->next_release_seq());
    return_path = "bisect-2 copy-only immediate COM release";
    release_job_callback_ref();
    return;
  }

  bool stale_publish_blocked = false;
  {
    std::lock_guard<std::mutex> lk(self->mu_);
    const uint64_t active_seq_at_publish = self->active_frame_seq_.load(std::memory_order_acquire);
    if (active_seq_at_publish != 0 && active_seq_at_publish != frame_seq) {
      if (ctx != nullptr) {
        ctx->stale = true;
        ctx->state = FrameContextState::StaleIgnored;
      }
      std::fprintf(stderr,
        "braw-proxy-cli: frame-seq: stale ProcessComplete publish blocked frame=%s seq=%llu active_seq=%llu job=%p img=%p tid=%zu\n",
        frame_label.c_str(), static_cast<unsigned long long>(frame_seq),
        static_cast<unsigned long long>(active_seq_at_publish), static_cast<void*>(job),
        static_cast<void*>(processedImage), braw_trace_tid_hash());
      std::fflush(stderr);
      stale_publish_blocked = true;
    } else {
      std::fprintf(stderr,
        "[ffmpeg-braw trace] handoff: publish packet (seq=%llu frame=%s pixels=%zu w=%u h=%u row=%u tid=%zu)\n",
        static_cast<unsigned long long>(frame_seq), frame_label.c_str(), plane.size(), width, height, rowBytes,
        braw_trace_tid_hash());
      std::fflush(stderr);
      /** Cumulative steps0..5: deferred clear; pending reset+pixels; dimensions; valid; last_hr; frame_ready. */
      int publish_last_step = -1;
      if (pce == 0 || pce == 4 || pce == 3)
        publish_last_step = 5;
      else if (pce == 11 || pce == 12)
        publish_last_step = 4; /** Step 5 (frame_ready) applied after 1st unlock; see pce 11/12 below. */
      else if (pce >= 5 && pce <= 10)
        publish_last_step = pce - 5;
      if (publish_last_step >= 0 && !defer_com) {
        self->deferred_process_job_ = nullptr;
        self->deferred_process_image_ = nullptr;
        self->deferred_frame_seq_ = 0;
      }
      if (publish_last_step >= 1) {
        self->pending_ = FrameHandoffPacket{};
        self->pending_.pixels = std::move(plane);
        self->pending_frame_seq_ = frame_seq;
      }
      if (publish_last_step >= 2) {
        self->pending_.w = width;
        self->pending_.h = height;
        self->pending_.row_bytes = rowBytes;
      }
      if (publish_last_step >= 3)
        self->pending_.valid = true;
      if (publish_last_step >= 4)
        self->last_hr_ = S_OK;
      if (publish_last_step >= 5) {
        self->frame_ready_ = true;
        self->ready_frame_seq_ = frame_seq;
        if (ctx != nullptr)
          ctx->state = FrameContextState::Published;
      }
      if (publish_bisect_no_notify) {
        std::fprintf(stderr,
          "[ffmpeg-braw trace] ProcessComplete: publish bisect — pce=%d publish_last_step=%d; cv notify_all skipped "
          "(tid=%zu)\n",
          pce, publish_last_step, braw_trace_tid_hash());
        if (publish_last_step >= 0 && publish_last_step < 5 && pce != 11 && pce != 12) {
          std::fprintf(stderr,
            "[ffmpeg-braw trace] ProcessComplete: publish bisect WARNING: incomplete handoff (step<5) — wait_processed "
            "may block (tid=%zu)\n",
            braw_trace_tid_hash());
        }
        std::fflush(stderr);
      } else if (notify_consumers) {
        std::fprintf(stderr, "[ffmpeg-braw trace] handoff: before notify (tid=%zu)\n", braw_trace_tid_hash());
        std::fflush(stderr);
        self->cv_.notify_all();
        std::fprintf(stderr, "[ffmpeg-braw trace] handoff: after notify (tid=%zu)\n", braw_trace_tid_hash());
        std::fflush(stderr);
      }
    }
  }
  if (stale_publish_blocked) {
    release_bmd_sdk_pair_logged(rel_job, rel_img, "ProcessComplete(stale publish blocked)", frame_index,
      self->next_release_seq());
    return_path = "stale publish blocked";
    release_job_callback_ref();
    return;
  }
  if (pce == 12) {
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->frame_ready_ = true;
      self->ready_frame_seq_ = frame_seq;
    }
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: bisect-12 — frame_ready_=true after 1st unlock, before COM Release "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
  }
  if (defer_com) {
    const char* defer_ctx = same_identity
                              ? "ProcessComplete(success defer canonical job Release to main)"
                              : "ProcessComplete(success defer image+job Release to main)";
    IBlackmagicRawJob* const defer_job = job;
    IBlackmagicRawProcessedImage* const defer_img = same_identity ? nullptr : processedImage;
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->deferred_process_job_ = defer_job;
      self->deferred_process_image_ = defer_img;
      self->deferred_frame_seq_ = frame_seq;
    }
    std::fprintf(stderr,
      "braw-proxy-cli: producer: deferred success-path COM stored under callback mu_ (ctx=%s frame=%s seq=%llu "
      "deferred_frame_seq=%llu job=%p img=%p tid=%zu)\n",
      defer_ctx, frame_label.c_str(), static_cast<unsigned long long>(frame_seq),
      static_cast<unsigned long long>(frame_seq), static_cast<void*>(defer_job), static_cast<void*>(defer_img),
      braw_trace_tid_hash());
    std::fprintf(stderr,
      "braw-proxy-cli: producer: chosen COM release strategy: %s (frame=%s img=%p job=%p tid=%zu)\n", defer_ctx,
      frame_label.c_str(), static_cast<void*>(processedImage), static_cast<void*>(job), braw_trace_tid_hash());
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: success-path job/img COM Release deferred to main (after dequeue); callback "
      "Release runs at return (frame=%s tid=%zu)\n",
      frame_label.c_str(), braw_trace_tid_hash());
    std::fflush(stderr);
  } else {
    const char* strategy_ctx = release_ctx;
    if (pce == 3 || pce == 10)
      strategy_ctx = same_identity ? "ProcessComplete(bisect-3 publish no notify job Release only)"
                                   : "ProcessComplete(bisect-3 publish no notify image then job Release)";
    else if (pce == 11)
      strategy_ctx = same_identity ? "ProcessComplete(bisect-11 ready-after-COM job Release only)"
                                   : "ProcessComplete(bisect-11 ready-after-COM image then job Release)";
    else if (pce == 12)
      strategy_ctx = same_identity ? "ProcessComplete(bisect-12 ready-before-COM job Release only)"
                                   : "ProcessComplete(bisect-12 ready-before-COM image then job Release)";
    else if (pce >= 5 && pce <= 9) {
      static thread_local char bisect_ctx[160];
      const int st = pce - 5;
      std::snprintf(bisect_ctx, sizeof(bisect_ctx), "ProcessComplete(bisect-publish pce=%d last_step=%d %s)", pce, st,
        same_identity ? "job Release only" : "image then job Release");
      strategy_ctx = bisect_ctx;
    } else if (pce == 4)
      strategy_ctx = same_identity ? "ProcessComplete(bisect-4 notify job Release only)"
                                   : "ProcessComplete(bisect-4 notify image then job Release)";
    std::fprintf(stderr,
      "braw-proxy-cli: producer: chosen COM release strategy: %s (frame=%s img=%p job=%p tid=%zu)\n", strategy_ctx,
      frame_label.c_str(), static_cast<void*>(processedImage), static_cast<void*>(job), braw_trace_tid_hash());
    std::fflush(stderr);
    if (same_identity)
      release_bmd_sdk_pair_logged(job, nullptr, strategy_ctx, frame_index, self->next_release_seq());
    else
      release_bmd_sdk_pair_logged(job, processedImage, strategy_ctx, frame_index, self->next_release_seq());
  }

  if (pce == 11) {
    {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->frame_ready_ = true;
      self->ready_frame_seq_ = frame_seq;
    }
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: bisect-11 — frame_ready_=true after COM Release on callback thread "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
  }

  bool pending_valid = false;
  IBlackmagicRawJob* deferred_job = nullptr;
  IBlackmagicRawProcessedImage* deferred_img = nullptr;
  uint64_t deferred_seq_exit = 0;
  {
    std::lock_guard<std::mutex> lk(self->mu_);
    pending_valid = self->pending_.valid;
    deferred_job = self->deferred_process_job_;
    deferred_img = self->deferred_process_image_;
    deferred_seq_exit = self->deferred_frame_seq_;
  }
  std::fprintf(stderr,
    "braw-proxy-cli: producer: ProcessComplete state exit frame=%s seq=%llu pending_valid=%d deferred_frame_seq=%llu "
    "deferred_job=%p deferred_img=%p tid=%zu\n",
    frame_index_label(frame_index).c_str(), static_cast<unsigned long long>(frame_seq), pending_valid ? 1 : 0,
    static_cast<unsigned long long>(deferred_seq_exit), static_cast<void*>(deferred_job),
    static_cast<void*>(deferred_img), braw_trace_tid_hash());
  std::fflush(stderr);
  if (defer_com) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning to SDK (success; COM release deferred to main safe point) "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "success deferred outside callback state";
  } else if (publish_bisect_no_notify) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning to SDK (publish bisect pce=%d; no notify_all; immediate COM on "
      "callback thread) (tid=%zu)\n",
      pce, braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "publish bisect no notify immediate COM";
  } else if (pce == 4) {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning to SDK (bisect-4 publish+notify; immediate COM on callback thread) "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "bisect-4 publish notify immediate COM";
  } else {
    std::fprintf(stderr,
      "[ffmpeg-braw trace] ProcessComplete: returning to SDK (success; COM release completed on callback thread) "
      "(tid=%zu)\n",
      braw_trace_tid_hash());
    std::fflush(stderr);
    return_path = "success callback-thread release";
  }
  /** Always balance ReadComplete's AddRef here; defer-success only defers job/img Release to main dequeue. */
  release_job_callback_ref();
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
    "defer_success_release_main=%d process_complete_experiment=%d consumer_handoff_experiment=%d "
    "handoff_copy_pixels=%d repro_legacy_consumer_stack_bundle=%d repro_legacy_reuse_pixel_buffer=%d tid=%zu\n",
    cfg.target_width, cfg.max_frames, static_cast<unsigned long long>(meta.frame_count),
    cfg.defer_success_release_to_main ? 1 : 0, cfg.process_complete_experiment, cfg.consumer_handoff_experiment,
    cfg.handoff_copy_pixels ? 1 : 0, cfg.repro_legacy_consumer_stack_bundle ? 1 : 0,
    cfg.repro_legacy_reuse_pixel_buffer ? 1 : 0, braw_trace_tid_hash());
  std::fflush(stderr);
  if (cfg.debug_trace) {
    const bool legacy = cfg.repro_legacy_consumer_stack_bundle || cfg.repro_legacy_reuse_pixel_buffer;
    std::fprintf(stderr,
      "braw-proxy-cli: decode: consumer_ownership_mode=%s repro_legacy_consumer_stack_bundle=%d "
      "repro_legacy_reuse_pixel_buffer=%d tid=%zu\n",
      legacy ? "LEGACY_REPRO" : "SAFE_PRODUCTION_FRESH_PER_FRAME", cfg.repro_legacy_consumer_stack_bundle ? 1 : 0,
      cfg.repro_legacy_reuse_pixel_buffer ? 1 : 0, braw_trace_tid_hash());
    std::fflush(stderr);
  }

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
  callback->set_process_complete_experiment(cfg.process_complete_experiment);
  callback->set_consumer_handoff_experiment(cfg.consumer_handoff_experiment);
  callback->set_handoff_copy_pixels(cfg.handoff_copy_pixels);
  if (cfg.repro_legacy_consumer_stack_bundle || cfg.repro_legacy_reuse_pixel_buffer) {
    callback->set_fresh_owned_per_frame(!cfg.repro_legacy_reuse_pixel_buffer);
  }

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

  const void* prev_frame_owned_obj = nullptr;
  void* prev_frame_owned_data = nullptr;
  size_t prev_frame_owned_cap = 0;
  size_t prev_frame_owned_size = 0;
  uint32_t prev_rb = 0;
  uint32_t prev_ow = 0;
  uint32_t prev_oh = 0;
  const void* prev_heap_completed_ptr = nullptr;

  /**
   * One frame cycle (success, typical immediate-COM producer): reset_wait clears prior slot → set_active_frame →
   * Submit read job → FlushJobs (ProcessComplete publishes pixel packet under mu_, sets frame_ready_, releases COM) →
   * wait_processed sees readiness → take_completed_frame moves pending_ out and clears readiness (or bisect variants) →
   * on_frame writes RGBA. Next iteration begins with reset_wait again.
   */
  for (uint64_t i = 0; i <= last_frame; ++i) {
    if (cfg.debug_trace) {
      std::fprintf(stderr,
        "braw-proxy-cli: loop: iteration ENTER (frame_index=%llu / last=%llu tid=%zu)\n",
        static_cast<unsigned long long>(i), static_cast<unsigned long long>(last_frame), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    callback->reset_wait();
    callback->set_active_frame_index(i);
    const uint64_t frame_seq = callback->begin_frame_sequence(i);
    if (cfg.debug_trace) {
      std::fprintf(stderr, "braw-proxy-cli: loop: frame setup ready for frame=%llu seq=%llu tid=%zu\n",
        static_cast<unsigned long long>(i), static_cast<unsigned long long>(frame_seq), braw_trace_tid_hash());
      std::fflush(stderr);
    }

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
    if (!callback->tag_job_with_frame_sequence(readJob, frame_seq, "read")) {
      safe_release(readJob);
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }
    if (cfg.debug_trace) {
      std::fprintf(stderr,
        "[ffmpeg-braw trace] 5 processing job created (read frame job, frame index %llu seq=%llu)\n",
        static_cast<unsigned long long>(i), static_cast<unsigned long long>(frame_seq));
      std::fprintf(stderr, "[ffmpeg-braw trace] 7 processing started (frame index %llu)\n",
        static_cast<unsigned long long>(i));
      std::fflush(stderr);
    }

    hr = readJob->Submit();
    if (cfg.debug_trace && SUCCEEDED(hr)) {
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

    if (cfg.debug_trace) {
      std::fprintf(stderr, "braw-proxy-cli: consumer: before FlushJobs (frame=%llu tid=%zu)\n",
        static_cast<unsigned long long>(i), braw_trace_tid_hash());
      std::fprintf(stderr, "[ffmpeg-braw trace] main: entering codec->FlushJobs (frame=%llu tid=%zu)\n",
        static_cast<unsigned long long>(i), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    hr = codec->FlushJobs();
    if (cfg.debug_trace) {
      std::fprintf(stderr, "braw-proxy-cli: consumer: after FlushJobs (frame=%llu hr=0x%08x tid=%zu)\n",
        static_cast<unsigned long long>(i), static_cast<unsigned int>(hr), braw_trace_tid_hash());
      std::fprintf(stderr, "[ffmpeg-braw trace] main: codec->FlushJobs returned to caller (frame=%llu hr=0x%08x tid=%zu)\n",
        static_cast<unsigned long long>(i), static_cast<unsigned int>(hr), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    if (FAILED(hr)) {
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    if (!callback->wait_processed(i, frame_seq)) {
      std::fprintf(stderr,
        "braw-proxy-cli: handoff wait failed or timed out (frame_index=%llu seq=%llu timeout_sec=%d)\n",
        static_cast<unsigned long long>(i), static_cast<unsigned long long>(frame_seq), cfg.handoff_timeout_sec);
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

    if (cfg.debug_trace) {
      std::fprintf(stderr, "[ffmpeg-braw trace] main after wait_processed (frame=%llu tid=%zu)\n",
        static_cast<unsigned long long>(i), braw_trace_tid_hash());
      std::fflush(stderr);
    }

    if (cfg.consumer_handoff_experiment == 1) {
      std::fprintf(stderr,
        "braw-proxy-cli: consumer bisect-1: skip take_completed_frame + on_frame (reset_wait on next iteration clears "
        "slot; avoid defer-COM producer or SDK objects may leak) (frame=%llu seq=%llu tid=%zu)\n",
        static_cast<unsigned long long>(i), static_cast<unsigned long long>(frame_seq), braw_trace_tid_hash());
      std::fflush(stderr);
      callback->finish_frame_sequence(frame_seq, i);
      continue;
    }

    /*
     * Production default (main thread): literal Ubuntu known-good consumer lifetime — new heap CompletedFrame each
     * iteration, dequeue via take_completed_frame_production_fresh (always new std::vector + memcpy), explicit
     * unique_ptr::reset before the next iteration. Repro flags select legacy stack and/or legacy pixel transfer only.
     */
    if (!cfg.repro_legacy_consumer_stack_bundle) {
      auto completed = std::make_unique<CompletedFrame>();
      void* const heap_obj = static_cast<void*>(completed.get());
      if (cfg.debug_trace) {
        std::fprintf(stderr,
          "braw-proxy-cli: consumer: production: allocated new heap CompletedFrame for frame=%llu CompletedFrame*=%p "
          "seq=%llu tid=%zu\n",
          static_cast<unsigned long long>(i), heap_obj, static_cast<unsigned long long>(frame_seq), braw_trace_tid_hash());
        if (prev_heap_completed_ptr != nullptr && static_cast<const void*>(heap_obj) == prev_heap_completed_ptr) {
          std::fprintf(stderr,
            "braw-proxy-cli: consumer: production: note: CompletedFrame* equals prior iteration freed pointer "
            "(heap allocator reuse; not the same live object)\n");
        }
        std::fflush(stderr);
      }

      const bool deq_ok =
        cfg.repro_legacy_reuse_pixel_buffer
          ? callback->take_completed_frame(completed->pixels, completed->row_bytes, completed->w, completed->h, i, frame_seq)
          : callback->take_completed_frame_production_fresh(completed->pixels, completed->row_bytes, completed->w,
              completed->h, i, frame_seq);
      if (!deq_ok) {
        callback->set_active_frame_index(kUnknownFrameIndex);
        safe_release(clip_attrs);
        safe_release(clip);
        safe_release(codec);
        callback->Release();
        safe_release(factory);
        return EX_DECODE;
      }

      if (cfg.debug_trace) {
        std::fprintf(stderr,
          "[ffmpeg-braw trace] main: frame %llu — packet on main; deferred COM (if any) drained in take_completed_frame "
          "(tid=%zu)\n",
          static_cast<unsigned long long>(i), braw_trace_tid_hash());
        std::fflush(stderr);
      }

      if (cfg.consumer_handoff_experiment == 4) {
        std::vector<uint8_t> fresh_owned(completed->pixels.begin(), completed->pixels.end());
        std::fprintf(stderr,
          "[ffmpeg-braw trace] consumer bisect-4: cloned fresh owned buffer before on_frame (frame=%llu old_data=%p "
          "old_cap=%zu fresh_data=%p fresh_cap=%zu tid=%zu)\n",
          static_cast<unsigned long long>(i),
          completed->pixels.empty() ? nullptr : static_cast<void*>(completed->pixels.data()), completed->pixels.capacity(),
          fresh_owned.empty() ? nullptr : static_cast<void*>(fresh_owned.data()), fresh_owned.capacity(),
          braw_trace_tid_hash());
        completed->pixels.swap(fresh_owned);
        fresh_owned = std::vector<uint8_t>{};
        std::fflush(stderr);
      }

      if (cfg.debug_trace) {
        void* const p = completed->pixels.empty() ? nullptr : static_cast<void*>(completed->pixels.data());
        std::fprintf(stderr,
          "[ffmpeg-braw trace] handoff-instrument: heap bundle before on_frame frame=%llu CompletedFrame*=%p "
          "pixels.data=%p size=%zu cap=%zu row=%u %ux%u tid=%zu\n",
          static_cast<unsigned long long>(i), heap_obj, p, completed->pixels.size(), completed->pixels.capacity(),
          static_cast<unsigned>(completed->row_bytes), static_cast<unsigned>(completed->w), static_cast<unsigned>(completed->h),
          braw_trace_tid_hash());
        std::fprintf(stderr,
          "braw-proxy-cli: consumer: calling on_frame (frame=%llu bytes=%zu row=%u %ux%u tid=%zu)\n",
          static_cast<unsigned long long>(i), completed->pixels.size(), static_cast<unsigned>(completed->row_bytes),
          static_cast<unsigned>(completed->w), static_cast<unsigned>(completed->h), braw_trace_tid_hash());
        std::fprintf(stderr,
          "[ffmpeg-braw trace] handoff-instrument: before on_frame heap CompletedFrame*=%p frame=%llu tid=%zu\n",
          heap_obj, static_cast<unsigned long long>(i), braw_trace_tid_hash());
        std::fflush(stderr);
      }

      if (!on_frame(completed->pixels.data(), completed->row_bytes, completed->w, completed->h, i)) {
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

      if (cfg.debug_trace) {
        std::fprintf(stderr, "braw-proxy-cli: consumer: on_frame OK; loop continues past frame %llu\n",
          static_cast<unsigned long long>(i));
        std::fprintf(stderr,
          "[ffmpeg-braw trace] handoff-instrument: after on_frame heap CompletedFrame*=%p frame=%llu tid=%zu\n",
          heap_obj, static_cast<unsigned long long>(i), braw_trace_tid_hash());
        void* const p2 = completed->pixels.empty() ? nullptr : static_cast<void*>(completed->pixels.data());
        std::fprintf(stderr,
          "[ffmpeg-braw trace] handoff-instrument: heap bundle after on_frame frame=%llu CompletedFrame*=%p "
          "pixels.data=%p size=%zu cap=%zu tid=%zu\n",
          static_cast<unsigned long long>(i), heap_obj, p2, completed->pixels.size(), completed->pixels.capacity(),
          braw_trace_tid_hash());
        std::fflush(stderr);
      }

      if (cfg.consumer_handoff_experiment == 5) {
        callback->scrub_after_on_frame(i);
        completed->pixels = std::vector<uint8_t>{};
        completed->row_bytes = 0;
        completed->w = 0;
        completed->h = 0;
        std::fprintf(stderr,
          "[ffmpeg-braw trace] consumer bisect-5: scrubbed callback/local frame state after on_frame (frame=%llu tid=%zu)\n",
          static_cast<unsigned long long>(i), braw_trace_tid_hash());
        std::fflush(stderr);
      }

      if (cfg.debug_trace) {
        std::fprintf(stderr,
          "braw-proxy-cli: loop: iteration EXIT (frame_index=%llu heap CompletedFrame*=%p bytes=%zu data=%p tid=%zu)\n",
          static_cast<unsigned long long>(i), heap_obj, completed->pixels.size(),
          completed->pixels.empty() ? nullptr : static_cast<void*>(completed->pixels.data()), braw_trace_tid_hash());
        std::fprintf(stderr,
          "braw-proxy-cli: consumer: production: destroying heap CompletedFrame before next iteration frame=%llu ptr=%p "
          "tid=%zu\n",
          static_cast<unsigned long long>(i), heap_obj, braw_trace_tid_hash());
        std::fflush(stderr);
      }

      prev_heap_completed_ptr = static_cast<const void*>(heap_obj);
      completed.reset();
      if (cfg.debug_trace) {
        std::fprintf(stderr,
          "braw-proxy-cli: consumer: production: CompletedFrame destroyed for frame=%llu (ptr was %p) tid=%zu\n",
          static_cast<unsigned long long>(i), heap_obj, braw_trace_tid_hash());
        std::fflush(stderr);
      }
      callback->finish_frame_sequence(frame_seq, i);
      continue;
    }

    /** Repro: legacy main-thread path — one stack `frame_owned` reused each iteration (see repro_legacy_consumer_stack_bundle). */
    std::vector<uint8_t> frame_owned;
    uint32_t rb = 0;
    uint32_t ow = 0;
    uint32_t oh = 0;
    if (!callback->take_completed_frame(frame_owned, rb, ow, oh, i, frame_seq)) {
      callback->set_active_frame_index(kUnknownFrameIndex);
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    if (cfg.debug_trace) {
      std::fprintf(stderr,
        "[ffmpeg-braw trace] main: frame %llu — packet on main; deferred COM (if any) drained in take_completed_frame "
        "(tid=%zu)\n",
        static_cast<unsigned long long>(i), braw_trace_tid_hash());
      std::fflush(stderr);
    }

    if (cfg.consumer_handoff_experiment == 4) {
      std::vector<uint8_t> fresh_owned(frame_owned.begin(), frame_owned.end());
      std::fprintf(stderr,
        "[ffmpeg-braw trace] consumer bisect-4: cloned fresh owned buffer before on_frame (frame=%llu old_data=%p "
        "old_cap=%zu fresh_data=%p fresh_cap=%zu tid=%zu)\n",
        static_cast<unsigned long long>(i), frame_owned.empty() ? nullptr : static_cast<void*>(frame_owned.data()),
        frame_owned.capacity(), fresh_owned.empty() ? nullptr : static_cast<void*>(fresh_owned.data()),
        fresh_owned.capacity(), braw_trace_tid_hash());
      frame_owned.swap(fresh_owned);
      fresh_owned = std::vector<uint8_t>{};
      std::fflush(stderr);
    }

    if (cfg.debug_trace) {
      const void* const objp = static_cast<const void*>(&frame_owned);
      void* const p = frame_owned.empty() ? nullptr : static_cast<void*>(frame_owned.data());
      std::fprintf(stderr,
        "[ffmpeg-braw trace] handoff-instrument: main before on_frame frame=%llu frame_owned.data=%p size=%zu cap=%zu "
        "frame_owned_obj=%p ptr_to_on_frame=%p tid=%zu\n",
        static_cast<unsigned long long>(i), p, frame_owned.size(), frame_owned.capacity(), objp, p,
        braw_trace_tid_hash());
      std::fprintf(stderr,
        "[ffmpeg-braw trace] handoff-instrument: frame reuse compare frame=%llu same_stack_obj_slot_as_prev=%d "
        "same_heap_data_ptr_as_prev=%d same_cap_as_prev=%d same_size_as_prev=%d same_dims_as_prev=%d prev_data=%p "
        "prev_cap=%zu prev_size=%zu prev_row=%u prev_wh=%ux%u prev_obj=%p tid=%zu\n",
        static_cast<unsigned long long>(i),
        (i > 0 && objp == prev_frame_owned_obj) ? 1 : 0,
        (i > 0 && p == prev_frame_owned_data) ? 1 : 0,
        (i > 0 && frame_owned.capacity() == prev_frame_owned_cap) ? 1 : 0,
        (i > 0 && frame_owned.size() == prev_frame_owned_size) ? 1 : 0,
        (i > 0 && rb == prev_rb && ow == prev_ow && oh == prev_oh) ? 1 : 0,
        prev_frame_owned_data, prev_frame_owned_cap, prev_frame_owned_size, prev_rb, prev_ow, prev_oh,
        prev_frame_owned_obj, braw_trace_tid_hash());
      if (!cfg.repro_legacy_reuse_pixel_buffer && i > 0 &&
          (p == prev_frame_owned_data || frame_owned.capacity() == prev_frame_owned_cap)) {
        std::fprintf(stderr,
          "[ffmpeg-braw trace] handoff-instrument: exclusive pixel buffer path: repeated data pointer or capacity vs "
          "prior frame is often heap allocator reuse, not proof the same std::vector storage object was retained\n");
        std::fflush(stderr);
      }
      std::fflush(stderr);
    }

    if (cfg.debug_trace) {
      std::fprintf(stderr,
        "braw-proxy-cli: consumer: calling on_frame (frame=%llu bytes=%zu row=%u %ux%u tid=%zu)\n",
        static_cast<unsigned long long>(i), frame_owned.size(), static_cast<unsigned>(rb), static_cast<unsigned>(ow),
        static_cast<unsigned>(oh), braw_trace_tid_hash());
      std::fflush(stderr);
    }
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
    if (cfg.debug_trace) {
      std::fprintf(stderr, "braw-proxy-cli: consumer: on_frame OK; loop continues past frame %llu\n",
        static_cast<unsigned long long>(i));
      std::fflush(stderr);
    }

    if (cfg.consumer_handoff_experiment == 5) {
      callback->scrub_after_on_frame(i);
      frame_owned = std::vector<uint8_t>{};
      rb = 0;
      ow = 0;
      oh = 0;
      std::fprintf(stderr,
        "[ffmpeg-braw trace] consumer bisect-5: scrubbed callback/local frame state after on_frame (frame=%llu tid=%zu)\n",
        static_cast<unsigned long long>(i), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    if (cfg.debug_trace) {
      void* const p2 = frame_owned.empty() ? nullptr : static_cast<void*>(frame_owned.data());
      std::fprintf(stderr,
        "[ffmpeg-braw trace] handoff-instrument: main after on_frame frame=%llu frame_owned.data=%p size=%zu cap=%zu "
        "tid=%zu\n",
        static_cast<unsigned long long>(i), p2, frame_owned.size(), frame_owned.capacity(), braw_trace_tid_hash());
      std::fprintf(stderr, "braw-proxy-cli: trace: frame index increment past %llu\n",
        static_cast<unsigned long long>(i));
      std::fflush(stderr);
    }
    if (cfg.debug_trace) {
      std::fprintf(stderr,
        "braw-proxy-cli: loop: iteration EXIT (frame_index=%llu frame_owned bytes=%zu data=%p tid=%zu)\n",
        static_cast<unsigned long long>(i), frame_owned.size(),
        frame_owned.empty() ? nullptr : static_cast<void*>(frame_owned.data()), braw_trace_tid_hash());
      std::fflush(stderr);
    }
    prev_frame_owned_obj = static_cast<const void*>(&frame_owned);
    prev_frame_owned_data = frame_owned.empty() ? nullptr : static_cast<void*>(frame_owned.data());
    prev_frame_owned_cap = frame_owned.capacity();
    prev_frame_owned_size = frame_owned.size();
    prev_rb = rb;
    prev_ow = ow;
    prev_oh = oh;
    callback->finish_frame_sequence(frame_seq, i);
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
  one.consumer_handoff_experiment = 0; /** Probe needs take_completed_frame + on_frame to capture dimensions. */
  one.handoff_copy_pixels = true; /** Keep probe on safe path regardless of CLI --handoff-move-pixels. */
  one.repro_legacy_consumer_stack_bundle = false; /** Probe uses production consumer ownership path. */
  one.repro_legacy_reuse_pixel_buffer = false;
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
