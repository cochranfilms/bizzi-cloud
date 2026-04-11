# braw-proxy-cli (`ffmpeg-braw`)

Headless Linux CLI: decode Blackmagic RAW (`.braw`) with the official **Blackmagic RAW SDK**, stream **RGBA** raw frames into **stock FFmpeg**, and produce an **H.264 MP4** proxy with **`+faststart`**. **Proxy v1 is video only** (`-an`): no audio passthrough or muxing.

## Requirements

- Ubuntu **24.04** x86_64 (or compatible).
- **Blackmagic RAW SDK** installed for Linux; this tree only ships **source**. Do not commit proprietary `.so` files.
- **Linux SDK tree** for CMake: directory that contains **`Include/BlackmagicRawAPI.h`** and **`Libraries/libBlackmagicRawAPI.so`** (official layout). Example from an RPM extract: `.../BlackmagicRAWSDK/Linux`.
- **Canonical runtime** on the worker (RPATH + wrapper): `/opt/braw-sdk/BlackmagicRawAPI` — copy or symlink SDK `.so` files there for production runs; the wrapper adjusts `LD_LIBRARY_PATH` if needed.
- **FFmpeg** with `libx264` (e.g. `apt install ffmpeg`).

## Build (exact)

`BRAW_SDK_ROOT` must be the **`Linux/`** folder inside the SDK (not the repository root), so `Include/` and `Libraries/` resolve correctly.

```bash
sudo apt install -y build-essential cmake ffmpeg

cd /path/to/bizzi-cloud

cmake -S native/braw-proxy-cli -B build-braw-cli -DCMAKE_BUILD_TYPE=Release \
  -DBRAW_SDK_ROOT=/home/ubuntu/braw-rpm-extract/usr/lib64/blackmagic/BlackmagicRAWSDK/Linux

cmake --build build-braw-cli -j
```

The executable is `build-braw-cli/braw-proxy-cli`.

## Install on the worker (exact)

Recommended: real binary plus small wrapper so SDK `.so` discovery matches your layout.

```bash
sudo install -d /opt/braw-worker/bin

sudo install -m 755 build-braw-cli/braw-proxy-cli /opt/braw-worker/bin/ffmpeg-braw.real

sudo install -m 755 native/braw-proxy-cli/scripts/ffmpeg-braw-wrapper.sh /opt/braw-worker/bin/ffmpeg-braw

sudo sed -i 's/\r$//' /opt/braw-worker/bin/ffmpeg-braw   # only if line endings came from Windows
```

Workers should invoke **`/opt/braw-worker/bin/ffmpeg-braw`** (wrapper). Adjust `LD_LIBRARY_PATH` inside the wrapper if `ldd /opt/braw-worker/bin/ffmpeg-braw.real` shows missing libs.

## Usage

```text
--input PATH       Source .braw (required)
--output PATH      Destination .mp4 (required)
--width N          Output width in pixels (default 1280); height follows aspect ratio (FFmpeg `scale=N:-2`, even height)
--crf N            x264 CRF 0–51 (default 23)
--ffmpeg PATH      FFmpeg binary (default /usr/bin/ffmpeg)
--max-frames N     Decode at most N frames (debug / smoke tests; optional)
--defer-success-release-main
                   Production-ish path: defer success-path COM Release to the main-thread safe point in
                   `take_completed_frame()` (ignored for bisect modes 3–4, which always release COM on the callback thread).
--flush-unwind-probe
                   Shorthand for `--process-complete-experiment 1` unless an explicit experiment is set.
--process-complete-experiment N
                   Bisect ProcessComplete success handoff vs `FlushJobs()` unwind (0–10). Callback-thread COM release
                   is always immediate in modes 1–4 and 5–10; defer flag applies only to mode 0.
 0 — normal (honor `--defer-success-release-main`)
                     1 — skip copy/publish/notify; immediate COM (flush unwind probe)
                     2 — copy only; no publish/notify; immediate COM
                     3 — copy + full publish under mutex; no notify_all; immediate COM
                     4 — copy + publish + notify_all; immediate COM
                   5–10 — cumulative publish-under-mutex bisect (same as 3: no notify_all). Each step adds, under lock:
                     5 — clear deferred_process_* only
                     6 — + reset `pending_` + move pixels
                     7 — + w, h, row_bytes
                     8 — + `pending_.valid`
                     9 — + `last_hr_`
                    10 — + `frame_ready_` (same publish body as mode 3)
--help             Print usage and exit 0
```

### Example: sample `profile.braw` from the SDK

Locate the bundled sample (path varies by SDK version):

```bash
find /opt/braw-sdk -name 'profile.braw' 2>/dev/null
```

Smoke test (10 frames):

```bash
/opt/braw-worker/bin/ffmpeg-braw \
  --input /opt/braw-sdk/path/to/profile.braw \
  --output /tmp/profile-proxy.mp4 \
  --width 1280 \
  --crf 23 \
  --max-frames 10

ffprobe -hide_banner /tmp/profile-proxy.mp4
```

## Exit codes (stable)

| Code | Meaning |
| ---: | --- |
| 0 | Success |
| 2 | Bad arguments |
| 3 | SDK init failure (factory / job setup) |
| 4 | Clip / metadata failure (includes **missing or invalid frame rate**) |
| 5 | Frame decode failure or **broken pipe** while feeding FFmpeg |
| 6 | FFmpeg **spawn** / pipe setup failure |
| 7 | FFmpeg **non-zero** exit |
| 8 | **Output validation** failure (missing file, size &lt; 512 bytes) |

## Smoke checklist

1. `--help` prints usage; exit 0.
2. Unknown flag → exit 2.
3. Sample `.braw` runs with `--max-frames 10`.
4. MP4 exists; internal check requires **≥ 512** bytes.
5. `ffprobe` shows **H.264** video.
6. Stream width matches **`--width`**; duration non-zero for full clips; with `--max-frames N`, duration is consistent with **N** frames at the reported frame rate.

## Manual worker contract (with the app)

1. `POST /api/workers/braw-proxy/claim` with `Authorization: Bearer MEDIA_BRAW_WORKER_SECRET`.
2. Download the source from `sourceDownloadUrl`.
3. Run `ffmpeg-braw --input … --output …`.
4. `PUT` the MP4 to `proxyUploadUrl` with `Content-Type: video/mp4` and `x-amz-server-side-encryption: AES256` when required.
5. `POST /api/workers/braw-proxy/complete` with `job_id` and `ok: true`.

## Troubleshooting (compile / link)

- **`BlackmagicRawAPI.h` not found** — set `-DBRAW_SDK_ROOT=` to the SDK **`Linux/`** root so **`${BRAW_SDK_ROOT}/Include/BlackmagicRawAPI.h`** exists.
- **`libBlackmagicRawAPI` not found** — ensure **`${BRAW_SDK_ROOT}/Libraries/libBlackmagicRawAPI.so`** exists (official Linux layout).
- **Linux SDK API shape** — Decode mirrors **`Samples/ProcessClipCPU`** / **ManualFlow*** and the public [BRAWconverter](https://gitlab.com/fnordware/BRAWconverter) job flow: **`CreateCodec`** (`IBlackmagicRaw*`), **`SetPipeline`** (**CPU**), **`OpenClip`**, **`GetFrameRate(float*)`**, **`GetFrameCount(uint64_t*)`**, **`SetCallback`**, **`CreateJobReadFrame` → `Submit`**, **`FlushJobs`**. Pixels come from **`ProcessComplete`** (**`IBlackmagicRawProcessedImage`**, **`GetResource`** on a **CPU** buffer). **`ReadComplete` / `ProcessComplete` are `void`**; **`QueryInterface`** uses **`memcmp`** on **`REFIID`**. Match **`OpenClip`** / sidecar types to **`Linux/Include`** if they differ from **`const char*`** / **`CFStringRef`**.
- **`IBlackmagicRawCallback`** — you must implement every pure virtual from **`BlackmagicRawAPI.h`**. If the linker reports missing vtable entries, add stub overrides (return `S_OK`) for the extra methods shown in the header.
- **`CreateBlackmagicRawFactoryInstance`** — older headers might return `HRESULT` with an out-parameter instead of a raw pointer; adjust the factory lines in `bmd_decode.cpp` if needed.
- **`GetFrameRate(uint32_t*, uint32_t*)`** — if your SDK only exposes `GetFrameRate(float*)`, remove the rational overload block at the top of `read_timing()` in `src/bmd_decode.cpp` and keep the `float` branch only (FFmpeg still gets a decimal `-framerate` string).

GPU decode (**CUDA** / **OpenCL**) is intentionally **out of scope** for v1.
