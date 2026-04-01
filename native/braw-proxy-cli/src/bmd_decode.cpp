#include "bmd_decode.hpp"

#include <BlackmagicRawAPI.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <vector>

bool braw_runtime_debug_enabled() {
  const char* e = std::getenv("BRAW_PROXY_DEBUG");
  return e != nullptr && e[0] != '\0' && std::strcmp(e, "0") != 0;
}

void braw_runtime_debug_log(const char* fmt, ...) {
  if (!braw_runtime_debug_enabled())
    return;
  std::fputs("[ffmpeg-braw] ", stderr);
  va_list ap;
  va_start(ap, fmt);
  std::vfprintf(stderr, fmt, ap);
  va_end(ap);
  std::fputc('\n', stderr);
}

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

/**
 * Codec callback matching ProcessClipCPU: COM refcounting, ReadComplete → decode+process job,
 * ProcessComplete copies CPU RGBA8 while IBlackmagicRawProcessedImage is still alive, then releases it.
 */
class DecodeCallback final : public IBlackmagicRawCallback {
 public:
  BlackmagicRawResolutionScale scale = blackmagicRawResolutionScaleFull;
  IBlackmagicRawClipProcessingAttributes* clip_attrs = nullptr;

  void ReadComplete(IBlackmagicRawJob* readJob, HRESULT result, IBlackmagicRawFrame* frame) override;
  void ProcessComplete(IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage) override;
  void DecodeComplete(IBlackmagicRawJob*, HRESULT) override {}
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

  void reset_wait() {
    std::lock_guard<std::mutex> lk(mu_);
    signaled_ = false;
    last_hr_ = S_OK;
    scratch_.clear();
    out_w_ = out_h_ = out_row_bytes_ = 0;
  }

  bool wait_processed() {
    std::unique_lock<std::mutex> lk(mu_);
    const bool ok = cv_.wait_for(lk, std::chrono::minutes(30), [&] { return signaled_; });
    return ok && SUCCEEDED(last_hr_) && !scratch_.empty();
  }

  HRESULT last_hr() const { return last_hr_; }
  const std::vector<uint8_t>& pixels() const { return scratch_; }
  uint32_t out_w() const { return out_w_; }
  uint32_t out_h() const { return out_h_; }
  uint32_t out_row_bytes() const { return out_row_bytes_; }

 private:
  std::atomic<ULONG> ref_count_{1};
  std::mutex mu_;
  std::condition_variable cv_;
  bool signaled_ = false;
  HRESULT last_hr_ = S_OK;
  std::vector<uint8_t> scratch_;
  uint32_t out_w_ = 0;
  uint32_t out_h_ = 0;
  uint32_t out_row_bytes_ = 0;

  ~DecodeCallback() = default;
};

void DecodeCallback::ReadComplete(IBlackmagicRawJob* readJob, HRESULT result, IBlackmagicRawFrame* frame) {
  IBlackmagicRawJob* decodeAndProcessJob = nullptr;
  if (readJob == nullptr || frame == nullptr) {
    if (readJob)
      readJob->Release();
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = E_POINTER;
    signaled_ = true;
    cv_.notify_one();
    return;
  }

  if (FAILED(result)) {
    readJob->Release();
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = result;
    signaled_ = true;
    cv_.notify_one();
    return;
  }

  HRESULT hr = S_OK;
  IBlackmagicRawFrameProcessingAttributes* frameAttr = nullptr;
  hr = frame->CloneFrameProcessingAttributes(&frameAttr);
  if (FAILED(hr) || frameAttr == nullptr) {
    safe_release(frame);
    readJob->Release();
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = FAILED(hr) ? hr : E_FAIL;
    signaled_ = true;
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
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = FAILED(hr) ? hr : E_FAIL;
    signaled_ = true;
    cv_.notify_one();
    return;
  }

  hr = decodeAndProcessJob->SetUserData(static_cast<void*>(this));
  if (FAILED(hr)) {
    safe_release(decodeAndProcessJob);
    safe_release(frame);
    readJob->Release();
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = hr;
    signaled_ = true;
    cv_.notify_one();
    return;
  }

  hr = decodeAndProcessJob->Submit();

  /** Read job is complete once read callback runs; same as sample — release before decode finishes. */
  safe_release(frame);
  readJob->Release();

  if (FAILED(hr)) {
    safe_release(decodeAndProcessJob);
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = hr;
    signaled_ = true;
    cv_.notify_one();
    return;
  }

  /** Submitted decode job: released in ProcessComplete after pixel copy (ProcessClipCPU ownership). */
}

void DecodeCallback::ProcessComplete(
  IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage) {
  braw_runtime_debug_log("ProcessComplete entered (job=%p processedImage=%p hr=0x%08x)", static_cast<void*>(job),
    static_cast<void*>(processedImage), static_cast<unsigned int>(result));

  DecodeCallback* self = nullptr;
  if (job != nullptr)
    job->GetUserData(reinterpret_cast<void**>(&self));

  if (self == nullptr || job == nullptr || processedImage == nullptr) {
    if (job)
      job->Release();
    if (self != nullptr) {
      std::lock_guard<std::mutex> lk(self->mu_);
      self->last_hr_ = E_POINTER;
      self->signaled_ = true;
      self->cv_.notify_one();
    }
    return;
  }

  if (FAILED(result)) {
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = result;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }

  uint32_t width = 0;
  uint32_t height = 0;
  uint32_t sizeBytes = 0;
  BlackmagicRawResourceFormat resourceFormat = blackmagicRawResourceFormatRGBAU8;
  BlackmagicRawResourceType resourceType = blackmagicRawResourceTypeBufferCPU;
  void* imageData = nullptr;

  HRESULT hr = processedImage->GetWidth(&width);
  if (SUCCEEDED(hr))
    hr = processedImage->GetHeight(&height);
  if (SUCCEEDED(hr))
    hr = processedImage->GetResourceSizeBytes(&sizeBytes);
  if (SUCCEEDED(hr))
    hr = processedImage->GetResourceFormat(&resourceFormat);
  if (SUCCEEDED(hr))
    hr = processedImage->GetResourceType(&resourceType);
  if (SUCCEEDED(hr))
    hr = processedImage->GetResource(&imageData);

  if (FAILED(hr) || imageData == nullptr || width == 0 || height == 0 || sizeBytes == 0) {
    processedImage->Release();
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = FAILED(hr) ? hr : E_FAIL;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }

  if (resourceType != blackmagicRawResourceTypeBufferCPU || resourceFormat != blackmagicRawResourceFormatRGBAU8) {
    processedImage->Release();
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = E_FAIL;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }

  /** Stride: prefer bytes-per-row from total size (may include padding), else width×4 for RGBAU8. */
  uint32_t rowBytes = sizeBytes / height;
  if (rowBytes < width * 4u) {
    processedImage->Release();
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = E_FAIL;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }

  braw_runtime_debug_log(
    "pixel buffer acquired w=%u h=%u sizeBytes=%u rowBytes=%u ptr=%p", width, height, sizeBytes, rowBytes, imageData);

  /** Must copy while processedImage is alive — buffer is not valid after Release (ProcessClipCPU). */
  {
    std::lock_guard<std::mutex> lk(self->mu_);
    self->scratch_.resize(static_cast<size_t>(sizeBytes));
    std::memcpy(self->scratch_.data(), imageData, static_cast<size_t>(sizeBytes));
    self->out_w_ = width;
    self->out_h_ = height;
    self->out_row_bytes_ = rowBytes;
  }

  processedImage->Release();
  processedImage = nullptr;

  job->Release();

  std::lock_guard<std::mutex> lk(self->mu_);
  self->last_hr_ = S_OK;
  self->signaled_ = true;
  self->cv_.notify_one();
}

static int init_factory_codec_cpu(IBlackmagicRawFactory*& factory, IBlackmagicRaw*& codec) {
  factory = CreateBlackmagicRawFactoryInstance();
  if (factory == nullptr)
    return EX_SDK_INIT;
  braw_runtime_debug_log("factory created");

  HRESULT hr = factory->CreateCodec(&codec);
  if (FAILED(hr) || codec == nullptr) {
    safe_release(factory);
    return EX_SDK_INIT;
  }
  braw_runtime_debug_log("codec created");

  IBlackmagicRawConfiguration* config = nullptr;
  if (SUCCEEDED(codec->QueryInterface(IID_IBlackmagicRawConfiguration, reinterpret_cast<void**>(&config)))) {
    hr = config->SetPipeline(blackmagicRawPipelineCPU, nullptr, nullptr);
    config->Release();
    if (FAILED(hr)) {
      safe_release(codec);
      safe_release(factory);
      return EX_SDK_INIT;
    }
  }

  braw_runtime_debug_log("CPU pipeline configured");
  return 0;
}

static int open_clip_on_codec(IBlackmagicRaw* codec, const std::string& input_path, IBlackmagicRawClip*& clip) {
  const HRESULT hr = codec->OpenClip(input_path.c_str(), &clip);
  if (FAILED(hr) || clip == nullptr) {
    return EX_CLIP;
  }
  braw_runtime_debug_log("clip opened");
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
  IBlackmagicRawFactory* factory = nullptr;
  IBlackmagicRaw* codec = nullptr;
  IBlackmagicRawClip* clip = nullptr;

  const int init = init_factory_codec_cpu(factory, codec);
  if (init != 0)
    return init;

  /** ProcessClipCPU: register callback before OpenClip so sidecar / async notifications are safe. */
  auto* callback = new DecodeCallback();
  braw_runtime_debug_log("callback instantiated (heap, ref_count=1)");

  callback->scale = pick_resolution_scale(meta.clip_width, cfg.target_width);

  HRESULT hr = codec->SetCallback(callback);
  if (FAILED(hr)) {
    callback->Release();
    safe_release(codec);
    safe_release(factory);
    return EX_SDK_INIT;
  }
  braw_runtime_debug_log("SetCallback ok (ProcessClipCPU order: before OpenClip)");

  const int oc = open_clip_on_codec(codec, input_path, clip);
  if (oc != 0) {
    safe_release(codec);
    callback->Release();
    safe_release(factory);
    return oc;
  }

  IBlackmagicRawClipProcessingAttributes* clip_attrs = nullptr;
  hr = clip->CloneClipProcessingAttributes(&clip_attrs);
  if (FAILED(hr) || clip_attrs == nullptr) {
    safe_release(clip);
    safe_release(codec);
    callback->Release();
    safe_release(factory);
    return EX_SDK_INIT;
  }
  callback->clip_attrs = clip_attrs;

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

  for (uint64_t i = 0; i <= last_frame; ++i) {
    if (i == 0)
      braw_runtime_debug_log("processing started (first frame index %llu)", static_cast<unsigned long long>(i));

    callback->reset_wait();

    IBlackmagicRawJob* readJob = nullptr;
    hr = clip->CreateJobReadFrame(i, &readJob);
    if (FAILED(hr) || readJob == nullptr) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    hr = readJob->Submit();
    if (FAILED(hr)) {
      readJob->Release();
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    hr = codec->FlushJobs();
    if (FAILED(hr)) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    if (!callback->wait_processed()) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    const auto& px = callback->pixels();
    if (!on_frame(px.data(), callback->out_row_bytes(), callback->out_w(), callback->out_h(), i)) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }
  }

  safe_release(clip_attrs);
  safe_release(clip);
  safe_release(codec);
  callback->Release();
  safe_release(factory);
  return 0;
}
