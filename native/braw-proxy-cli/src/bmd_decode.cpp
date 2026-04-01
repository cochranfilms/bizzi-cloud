#include "bmd_decode.hpp"

#include <BlackmagicRawAPI.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
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

  float fps_inte = 0.F;
  const float fps_frac = std::modff(fr, &fps_inte);
  if (fps_frac == 0.F) {
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
 * Codec callback matching IBlackmagicRawCallback (see SDK Samples + public BRAWconverter flow):
 * ReadComplete → CreateJobDecodeAndProcessFrame → ProcessComplete with IBlackmagicRawProcessedImage CPU buffer.
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
  void SidecarMetadataParseWarning(IBlackmagicRawClip*, CFStringRef, uint32_t, CFStringRef) override {}
  void SidecarMetadataParseError(IBlackmagicRawClip*, CFStringRef, uint32_t, CFStringRef) override {}
  void PreparePipelineComplete(void*, HRESULT) override {}

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (ppv == nullptr)
      return E_POINTER;
    *ppv = nullptr;
    if (braw_iid_eq(riid, IID_IBlackmagicRawCallback)) {
      *ppv = static_cast<IBlackmagicRawCallback*>(this);
      return S_OK;
    }
    return E_NOINTERFACE;
  }

  ULONG STDMETHODCALLTYPE AddRef() override { return 1; }
  ULONG STDMETHODCALLTYPE Release() override { return 1; }

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
  std::mutex mu_;
  std::condition_variable cv_;
  bool signaled_ = false;
  HRESULT last_hr_ = S_OK;
  std::vector<uint8_t> scratch_;
  uint32_t out_w_ = 0;
  uint32_t out_h_ = 0;
  uint32_t out_row_bytes_ = 0;
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
  safe_release(frame);
  readJob->Release();
  /** decodeAndProcessJob is released in ProcessComplete after pixel copy. */

  if (FAILED(hr)) {
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = hr;
    signaled_ = true;
    cv_.notify_one();
  }
}

void DecodeCallback::ProcessComplete(
  IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage) {
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

  processedImage->Release();

  if (FAILED(hr) || imageData == nullptr || width == 0 || height == 0 || sizeBytes == 0) {
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = FAILED(hr) ? hr : E_FAIL;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }

  if (resourceType != blackmagicRawResourceTypeBufferCPU || resourceFormat != blackmagicRawResourceFormatRGBAU8) {
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = E_FAIL;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }

  const uint32_t rb = sizeBytes / height;
  if (rb < width * 4u) {
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = E_FAIL;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }

  {
    std::lock_guard<std::mutex> lk(self->mu_);
    self->scratch_.resize(static_cast<size_t>(sizeBytes));
    std::memcpy(self->scratch_.data(), imageData, static_cast<size_t>(sizeBytes));
    self->out_w_ = width;
    self->out_h_ = height;
    self->out_row_bytes_ = rb;
  }

  job->Release();

  std::lock_guard<std::mutex> lk(self->mu_);
  self->last_hr_ = S_OK;
  self->signaled_ = true;
  self->cv_.notify_one();
}

static int create_cpu_codec_chain(const std::string& input_path, IBlackmagicRawFactory*& factory, IBlackmagicRaw*& codec,
  IBlackmagicRawClip*& clip) {
  factory = CreateBlackmagicRawFactoryInstance();
  if (factory == nullptr)
    return EX_SDK_INIT;

  HRESULT hr = factory->CreateCodec(&codec);
  if (FAILED(hr) || codec == nullptr) {
    safe_release(factory);
    return EX_SDK_INIT;
  }

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

  hr = codec->OpenClip(input_path.c_str(), &clip);
  if (FAILED(hr) || clip == nullptr) {
    safe_release(codec);
    safe_release(factory);
    return EX_CLIP;
  }
  return 0;
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

  const int chain = create_cpu_codec_chain(input_path, factory, codec, clip);
  if (chain != 0)
    return chain;

  IBlackmagicRawClipProcessingAttributes* clip_attrs = nullptr;
  HRESULT hr = clip->CloneClipProcessingAttributes(&clip_attrs);
  if (FAILED(hr) || clip_attrs == nullptr) {
    safe_release(clip);
    safe_release(codec);
    safe_release(factory);
    return EX_SDK_INIT;
  }

  DecodeCallback callback;
  callback.scale = pick_resolution_scale(meta.clip_width, cfg.target_width);
  callback.clip_attrs = clip_attrs;

  hr = codec->SetCallback(&callback);
  if (FAILED(hr)) {
    safe_release(clip_attrs);
    safe_release(clip);
    safe_release(codec);
    safe_release(factory);
    return EX_SDK_INIT;
  }

  if (meta.frame_count == 0) {
    safe_release(clip_attrs);
    safe_release(clip);
    safe_release(codec);
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
      safe_release(factory);
      return EX_DECODE;
    }
    last_frame = std::min(last_frame, cap - 1ULL);
  }

  for (uint64_t i = 0; i <= last_frame; ++i) {
    callback.reset_wait();

    IBlackmagicRawJob* readJob = nullptr;
    hr = clip->CreateJobReadFrame(i, &readJob);
    if (FAILED(hr) || readJob == nullptr) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      safe_release(factory);
      return EX_DECODE;
    }

    hr = readJob->Submit();
    if (FAILED(hr)) {
      readJob->Release();
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      safe_release(factory);
      return EX_DECODE;
    }

    hr = codec->FlushJobs();
    if (FAILED(hr)) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      safe_release(factory);
      return EX_DECODE;
    }

    if (!callback.wait_processed()) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      safe_release(factory);
      return EX_DECODE;
    }

    const auto& px = callback.pixels();
    if (!on_frame(px.data(), callback.out_row_bytes(), callback.out_w(), callback.out_h(), i)) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      safe_release(factory);
      return EX_DECODE;
    }
  }

  safe_release(clip_attrs);
  safe_release(clip);
  safe_release(codec);
  safe_release(factory);
  return 0;
}
