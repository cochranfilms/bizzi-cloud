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

  void reset_wait() {
    std::lock_guard<std::mutex> hf(handoff_mu_);
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

  /**
   * After wait_processed(), copy the last decoded plane from scratch_ into owned storage for FFmpeg.
   * The SDK reuses internal processed buffers across frames; always I/O from this copy, not from pixels().
   */
  bool export_owned_frame_for_ffmpeg(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w, uint32_t& h);

 private:
  std::atomic<ULONG> ref_count_{1};
  /** Serializes SDK scratch_ writes vs main-thread export to frame_owned (SDK callbacks may use worker threads). */
  std::mutex handoff_mu_;
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

bool DecodeCallback::export_owned_frame_for_ffmpeg(std::vector<uint8_t>& owned, uint32_t& row_bytes, uint32_t& w,
  uint32_t& h) {
  std::fprintf(stderr, "[ffmpeg-braw trace] ffmpeg-handoff wait locks (tid=%zu main-path)\n", braw_trace_tid_hash());
  std::fflush(stderr);
  std::lock_guard<std::mutex> hf(handoff_mu_);
  std::lock_guard<std::mutex> lk(mu_);
  if (!SUCCEEDED(last_hr_) || scratch_.empty() || out_w_ == 0 || out_h_ == 0)
    return false;
  row_bytes = out_row_bytes_;
  w = out_w_;
  h = out_h_;
  const size_t nbytes = static_cast<size_t>(row_bytes) * static_cast<size_t>(h);
  if (nbytes == 0 || nbytes > scratch_.size())
    return false;
  std::fprintf(stderr, "[ffmpeg-braw trace] ffmpeg-handoff before owned.resize (nbytes=%zu tid=%zu)\n", nbytes,
    braw_trace_tid_hash());
  std::fflush(stderr);
  owned.resize(nbytes);
  std::fprintf(stderr, "[ffmpeg-braw trace] ffmpeg-handoff after owned.resize (owned.size=%zu tid=%zu)\n", owned.size(),
    braw_trace_tid_hash());
  std::fflush(stderr);
  std::fprintf(stderr, "[ffmpeg-braw trace] ffmpeg-handoff copy start (row_bytes=%u h=%u nbytes=%zu tid=%zu)\n", row_bytes,
    h, nbytes, braw_trace_tid_hash());
  std::fflush(stderr);
  std::fprintf(stderr, "[ffmpeg-braw trace] ffmpeg-handoff before memcpy (dst=%p src=%p tid=%zu)\n",
    static_cast<void*>(owned.data()), static_cast<void*>(scratch_.data()), braw_trace_tid_hash());
  std::fflush(stderr);
  std::memcpy(owned.data(), scratch_.data(), nbytes);
  std::fprintf(stderr, "[ffmpeg-braw trace] ffmpeg-handoff after memcpy (nbytes=%zu tid=%zu)\n", nbytes,
    braw_trace_tid_hash());
  std::fflush(stderr);
  std::fprintf(stderr, "[ffmpeg-braw trace] ffmpeg-handoff copy complete (nbytes=%zu tid=%zu)\n", nbytes,
    braw_trace_tid_hash());
  std::fflush(stderr);
  return true;
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
    safe_release(decodeAndProcessJob);
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = hr;
    signaled_ = true;
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
  if (SUCCEEDED(hr)) {
    std::fprintf(stderr, "[ffmpeg-braw trace] 9 width/height acquired (w=%u h=%u)\n", width, height);
    std::fflush(stderr);
  }
  if (SUCCEEDED(hr))
    hr = processedImage->GetResourceSizeBytes(&sizeBytes);
  if (SUCCEEDED(hr))
    hr = processedImage->GetResourceFormat(&resourceFormat);
  if (SUCCEEDED(hr))
    hr = processedImage->GetResourceType(&resourceType);
  if (SUCCEEDED(hr))
    hr = processedImage->GetResource(&imageData);

  if (SUCCEEDED(hr) && imageData != nullptr) {
    std::fprintf(stderr, "[ffmpeg-braw trace] 10 pixel/resource buffer acquired (ptr=%p sizeBytes=%u)\n",
      static_cast<void*>(imageData), sizeBytes);
    std::fprintf(stderr, "[ffmpeg-braw trace] processed buffer acquired\n");
    std::fflush(stderr);
  }

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

  /** Stride: bytes-per-row from total size; plane size is rowBytes * height (must fit in GetResourceSizeBytes). */
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

  const uint64_t plane_u64 = static_cast<uint64_t>(rowBytes) * static_cast<uint64_t>(height);
  if (plane_u64 == 0ULL || plane_u64 > static_cast<uint64_t>(sizeBytes)
      || plane_u64 > static_cast<uint64_t>((std::numeric_limits<size_t>::max)())) {
    processedImage->Release();
    job->Release();
    std::lock_guard<std::mutex> lk(self->mu_);
    self->last_hr_ = E_FAIL;
    self->signaled_ = true;
    self->cv_.notify_one();
    return;
  }
  const size_t plane_bytes = static_cast<size_t>(plane_u64);

  std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned copy start (src=%p plane_bytes=%zu sizeBytes=%u tid=%zu)\n",
    static_cast<void*>(imageData), plane_bytes, sizeBytes, braw_trace_tid_hash());
  std::fflush(stderr);

  /** Serialize scratch_ mutation vs main export; same lock order as export_owned_frame_for_ffmpeg (handoff then mu). */
  {
    std::lock_guard<std::mutex> hf(self->handoff_mu_);
    std::lock_guard<std::mutex> lk(self->mu_);
    std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned before scratch_.resize (plane_bytes=%zu tid=%zu)\n", plane_bytes,
      braw_trace_tid_hash());
    std::fflush(stderr);
    self->scratch_.resize(plane_bytes);
    std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned after scratch_.resize (scratch_.size=%zu tid=%zu)\n",
      self->scratch_.size(), braw_trace_tid_hash());
    std::fflush(stderr);
    std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned before memcpy (dst=%p src=%p tid=%zu)\n",
      static_cast<void*>(self->scratch_.data()), static_cast<void*>(imageData), braw_trace_tid_hash());
    std::fflush(stderr);
    std::memcpy(self->scratch_.data(), imageData, plane_bytes);
    std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned after memcpy (plane_bytes=%zu tid=%zu)\n", plane_bytes,
      braw_trace_tid_hash());
    std::fflush(stderr);
    self->out_w_ = width;
    self->out_h_ = height;
    self->out_row_bytes_ = rowBytes;
  }

  std::fprintf(stderr, "[ffmpeg-braw trace] SDK→owned copy complete (plane_bytes=%zu tid=%zu)\n", plane_bytes,
    braw_trace_tid_hash());
  std::fflush(stderr);

  std::fprintf(stderr, "[ffmpeg-braw trace] before processedImage->Release (tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);
  processedImage->Release();
  processedImage = nullptr;
  std::fprintf(stderr, "[ffmpeg-braw trace] after processedImage->Release (tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);

  std::fprintf(stderr, "[ffmpeg-braw trace] before job->Release (tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);
  job->Release();
  std::fprintf(stderr, "[ffmpeg-braw trace] after job->Release (tid=%zu)\n", braw_trace_tid_hash());
  std::fflush(stderr);

  std::lock_guard<std::mutex> lk(self->mu_);
  self->last_hr_ = S_OK;
  self->signaled_ = true;
  self->cv_.notify_one();
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

  for (uint64_t i = 0; i <= last_frame; ++i) {
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

    std::fprintf(stderr, "[ffmpeg-braw trace] main after wait_processed (frame=%llu tid=%zu)\n",
      static_cast<unsigned long long>(i), braw_trace_tid_hash());
    std::fflush(stderr);

    std::vector<uint8_t> frame_owned;
    uint32_t rb = 0;
    uint32_t ow = 0;
    uint32_t oh = 0;
    if (!callback->export_owned_frame_for_ffmpeg(frame_owned, rb, ow, oh)) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }

    if (!on_frame(frame_owned.data(), rb, ow, oh, i)) {
      safe_release(clip_attrs);
      safe_release(clip);
      safe_release(codec);
      callback->Release();
      safe_release(factory);
      return EX_DECODE;
    }
  }

  std::fprintf(stderr, "[ffmpeg-braw trace] 12 frame loop completed\n");
  std::fflush(stderr);

  std::fprintf(stderr, "[ffmpeg-braw trace] 13 cleanup start\n");
  std::fflush(stderr);
  safe_release(clip_attrs);
  safe_release(clip);
  safe_release(codec);
  callback->Release();
  safe_release(factory);
  std::fprintf(stderr, "[ffmpeg-braw trace] 14 cleanup complete\n");
  std::fflush(stderr);
  return 0;
}
