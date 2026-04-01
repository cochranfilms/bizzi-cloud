#include "bmd_decode.hpp"

#include <BlackmagicRawAPI.h>

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cmath>
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

static bool fps_valid(double fps) {
  return std::isfinite(fps) && fps > 1e-6 && fps < 1e6;
}

/** Matches ProcessClipCPU-style resolution scale selection (Linux SDK enums). */
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
  dw = std::max(1u, cw);
  dh = std::max(1u, ch);
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

static int read_timing(IBlackmagicRawClip* clip, ClipMeta& meta) {
  uint32_t num = 0;
  uint32_t den = 0;
  HRESULT hr = clip->GetFrameRate(&num, &den);
  if (SUCCEEDED(hr) && den > 0 && num > 0) {
    meta.fps = static_cast<double>(num) / static_cast<double>(den);
    meta.fps_num = num;
    meta.fps_den = den;
    if (!fps_valid(meta.fps))
      return EX_CLIP;
    return 0;
  }
  float f = 0.F;
  hr = clip->GetFrameRate(&f);
  if (SUCCEEDED(hr) && f > 0.F) {
    meta.fps = static_cast<double>(f);
    meta.fps_num = 0;
    meta.fps_den = 0;
    if (!fps_valid(meta.fps))
      return EX_CLIP;
    return 0;
  }
  return EX_CLIP;
}

/**
 * CPU decode completion: mirrors SDK samples (ProcessClipCPU / ManualFlow*) —
 * IBlackmagicRawCallback must match BlackmagicRawAPI.h (all pure virtuals implemented).
 */
class FrameSink final : public IBlackmagicRawCallback {
 public:
  FrameSink() = default;

  virtual HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (ppv == nullptr)
      return E_POINTER;
    *ppv = nullptr;
    if (riid == IID_IBlackmagicRawUnknown || riid == IID_IBlackmagicRawCallback) {
      *ppv = static_cast<IBlackmagicRawCallback*>(this);
      AddRef();
      return S_OK;
    }
    return E_NOINTERFACE;
  }

  virtual ULONG STDMETHODCALLTYPE AddRef() override {
    return ++ref_count_;
  }

  virtual ULONG STDMETHODCALLTYPE Release() override {
    const ULONG c = --ref_count_;
    if (c == 0)
      delete this;
    return c;
  }

  virtual HRESULT STDMETHODCALLTYPE ReadComplete(IBlackmagicRawJob* /*job*/, HRESULT result,
    IBlackmagicRawFrame* frame) override {
    std::lock_guard<std::mutex> lk(mu_);
    last_hr_ = result;
    row_bytes_ = decoded_w_ = decoded_h_ = 0;
    scratch_.clear();

    if (FAILED(result) || frame == nullptr) {
      signaled_ = true;
      cv_.notify_one();
      return S_OK;
    }

    IBlackmagicRawProcessedImage* processed = nullptr;
    HRESULT pr = frame->GetProcessedImage(&processed);
    if (FAILED(pr) || processed == nullptr) {
      safe_release(frame);
      last_hr_ = FAILED(pr) ? pr : E_FAIL;
      signaled_ = true;
      cv_.notify_one();
      return S_OK;
    }

    uint32_t w = 0;
    uint32_t h = 0;
    uint32_t rb = 0;
    if (FAILED(processed->GetWidth(&w)) || FAILED(processed->GetHeight(&h)) || FAILED(processed->GetRowBytes(&rb))
        || w == 0 || h == 0 || rb < w * 4u) {
      safe_release(processed);
      safe_release(frame);
      last_hr_ = E_FAIL;
      signaled_ = true;
      cv_.notify_one();
      return S_OK;
    }

    void* res = nullptr;
    if (FAILED(processed->GetResource(&res)) || res == nullptr) {
      safe_release(processed);
      safe_release(frame);
      last_hr_ = E_FAIL;
      signaled_ = true;
      cv_.notify_one();
      return S_OK;
    }

    const size_t nbytes = static_cast<size_t>(rb) * static_cast<size_t>(h);
    scratch_.resize(nbytes);
    std::memcpy(scratch_.data(), res, nbytes);
    row_bytes_ = rb;
    decoded_w_ = w;
    decoded_h_ = h;

    safe_release(processed);
    safe_release(frame);

    signaled_ = true;
    cv_.notify_one();
    return S_OK;
  }

  void begin_wait_for_frame() {
    std::lock_guard<std::mutex> lk(mu_);
    signaled_ = false;
    last_hr_ = S_OK;
    scratch_.clear();
    row_bytes_ = decoded_w_ = decoded_h_ = 0;
  }

  bool wait_frame() {
    std::unique_lock<std::mutex> lk(mu_);
    cv_.wait(lk, [&] { return signaled_; });
    return SUCCEEDED(last_hr_) && !scratch_.empty();
  }

  HRESULT last_hr() const { return last_hr_; }
  const std::vector<uint8_t>& pixels() const { return scratch_; }
  uint32_t row_bytes() const { return row_bytes_; }
  uint32_t decoded_w() const { return decoded_w_; }
  uint32_t decoded_h() const { return decoded_h_; }

 private:
  std::atomic<ULONG> ref_count_{1};
  std::mutex mu_;
  std::condition_variable cv_;
  bool signaled_ = false;
  HRESULT last_hr_ = S_OK;
  std::vector<uint8_t> scratch_;
  uint32_t row_bytes_ = 0;
  uint32_t decoded_w_ = 0;
  uint32_t decoded_h_ = 0;
};

int braw_probe_clip(const std::string& input_path, ClipMeta& meta) {
  IBlackmagicRawFactory* factory = CreateBlackmagicRawFactoryInstance();
  if (factory == nullptr)
    return EX_SDK_INIT;

  IBlackmagicRawClip* clip = nullptr;
  HRESULT hr = factory->CreateOpenClip(input_path.c_str(), &clip);
  if (FAILED(hr) || clip == nullptr) {
    safe_release(factory);
    return EX_CLIP;
  }

  uint32_t w = 0;
  uint32_t h = 0;
  if (FAILED(clip->GetWidth(&w)) || FAILED(clip->GetHeight(&h)) || w == 0 || h == 0) {
    safe_release(clip);
    safe_release(factory);
    return EX_CLIP;
  }
  meta.clip_width = w;
  meta.clip_height = h;

  uint32_t fc = 0;
  hr = clip->GetFrameCount(&fc);
  if (FAILED(hr)) {
    safe_release(clip);
    safe_release(factory);
    return EX_CLIP;
  }
  meta.frame_count = fc;

  if (read_timing(clip, meta) != 0) {
    safe_release(clip);
    safe_release(factory);
    return EX_CLIP;
  }

  safe_release(clip);
  safe_release(factory);
  return 0;
}

int braw_decode_frames(const std::string& input_path, const BrawDecodeConfig& cfg, const ClipMeta& meta,
  const std::function<bool(const uint8_t* pixels, uint32_t row_bytes, uint32_t w, uint32_t h, uint64_t frame_index)>&
    on_frame) {
  IBlackmagicRawFactory* factory = CreateBlackmagicRawFactoryInstance();
  if (factory == nullptr)
    return EX_SDK_INIT;

  IBlackmagicRawClip* clip = nullptr;
  HRESULT hr = factory->CreateOpenClip(input_path.c_str(), &clip);
  if (FAILED(hr) || clip == nullptr) {
    safe_release(factory);
    return EX_CLIP;
  }

  IBlackmagicRawJob* job = nullptr;
  hr = factory->CreateJobFromClip(clip, &job);
  if (FAILED(hr) || job == nullptr) {
    safe_release(clip);
    safe_release(factory);
    return EX_SDK_INIT;
  }

  FrameSink* sink = new FrameSink();
  if (FAILED(job->SetCallback(sink))) {
    sink->Release();
    safe_release(job);
    safe_release(clip);
    safe_release(factory);
    return EX_SDK_INIT;
  }

  const BlackmagicRawResolutionScale scale = pick_resolution_scale(meta.clip_width, cfg.target_width);
  if (FAILED(job->SetResolutionScale(scale))) {
    safe_release(job);
    safe_release(clip);
    safe_release(factory);
    return EX_SDK_INIT;
  }

  if (FAILED(job->SetProcessFormat(blackmagicRawProcessedImageFormatRGBAU8))) {
    safe_release(job);
    safe_release(clip);
    safe_release(factory);
    return EX_SDK_INIT;
  }

  uint64_t last_frame = meta.frame_count > 0 ? meta.frame_count - 1ULL : 0;
  if (meta.frame_count == 0) {
    safe_release(job);
    safe_release(clip);
    safe_release(factory);
    return EX_CLIP;
  }

  if (cfg.max_frames > 0) {
    const uint64_t cap = static_cast<uint64_t>(cfg.max_frames);
    if (cap <= 0) {
      safe_release(job);
      safe_release(clip);
      safe_release(factory);
      return EX_DECODE;
    }
    last_frame = std::min(last_frame, cap - 1ULL);
  }

  for (uint64_t i = 0; i <= last_frame; ++i) {
    sink->begin_wait_for_frame();
    hr = job->ReadFrame(i);
    if (FAILED(hr)) {
      safe_release(job);
      safe_release(clip);
      safe_release(factory);
      return EX_DECODE;
    }
    if (!sink->wait_frame()) {
      safe_release(job);
      safe_release(clip);
      safe_release(factory);
      return EX_DECODE;
    }
    const auto& px = sink->pixels();
    if (!on_frame(px.data(), sink->row_bytes(), sink->decoded_w(), sink->decoded_h(), i)) {
      safe_release(job);
      safe_release(clip);
      safe_release(factory);
      return EX_DECODE;
    }
  }

  safe_release(job);
  safe_release(clip);
  safe_release(factory);
  return 0;
}
