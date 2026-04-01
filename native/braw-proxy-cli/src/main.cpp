#include "bmd_decode.hpp"

#include <csignal>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cerrno>
#include <fcntl.h>
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>

#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

extern char** environ;

namespace {

constexpr int kParseHelp = -1;

struct Options {
  std::string input;
  std::string output;
  std::string ffmpeg = "/usr/bin/ffmpeg";
  int width = 1280;
  int crf = 23;
  int max_frames = 0;
};

void print_usage(const char* argv0) {
  std::cerr << "Usage: " << argv0
            << " --input /path/to/file.braw --output /path/to/out.mp4"
               " [--width 1280] [--crf 23] [--ffmpeg /usr/bin/ffmpeg] [--max-frames N]\n";
}

int parse_args(int argc, char** argv, Options& o) {
  for (int i = 1; i < argc; ++i) {
    const char* a = argv[i];
    if (std::strcmp(a, "--input") == 0 && i + 1 < argc) {
      o.input = argv[++i];
    } else if (std::strcmp(a, "--output") == 0 && i + 1 < argc) {
      o.output = argv[++i];
    } else if (std::strcmp(a, "--width") == 0 && i + 1 < argc) {
      o.width = std::atoi(argv[++i]);
    } else if (std::strcmp(a, "--crf") == 0 && i + 1 < argc) {
      o.crf = std::atoi(argv[++i]);
    } else if (std::strcmp(a, "--ffmpeg") == 0 && i + 1 < argc) {
      o.ffmpeg = argv[++i];
    } else if (std::strcmp(a, "--max-frames") == 0 && i + 1 < argc) {
      o.max_frames = std::atoi(argv[++i]);
      if (o.max_frames < 0) {
        std::cerr << "--max-frames must be non-negative\n";
        return EX_USAGE;
      }
    } else if (std::strcmp(a, "--help") == 0 || std::strcmp(a, "-h") == 0) {
      print_usage(argv[0]);
      return kParseHelp;
    } else {
      std::cerr << "Unknown argument: " << a << "\n";
      print_usage(argv[0]);
      return EX_USAGE;
    }
  }
  if (o.input.empty() || o.output.empty()) {
    print_usage(argv[0]);
    return EX_USAGE;
  }
  if (o.width < 1) {
    std::cerr << "--width must be >= 1 (default 1280)\n";
    return EX_USAGE;
  }
  if (o.crf < 0 || o.crf > 51) {
    std::cerr << "--crf must be 0..51\n";
    return EX_USAGE;
  }
  return 0;
}

std::string framerate_arg(const ClipMeta& m) {
  if (m.fps_den != 0 && m.fps_num != 0)
    return std::to_string(m.fps_num) + "/" + std::to_string(m.fps_den);
  char buf[64];
  std::snprintf(buf, sizeof(buf), "%.10g", m.fps);
  return std::string(buf);
}

ssize_t write_all(int fd, const void* buf, size_t n) {
  const auto* p = static_cast<const std::uint8_t*>(buf);
  size_t off = 0;
  while (off < n) {
    const ssize_t w = ::write(fd, p + off, n - off);
    if (w < 0) {
      if (errno == EINTR)
        continue;
      return -1;
    }
    if (w == 0)
      return -1;
    off += static_cast<size_t>(w);
  }
  return static_cast<ssize_t>(n);
}

int validate_output_file(const std::string& path) {
  std::error_code ec;
  const auto sz = std::filesystem::file_size(path, ec);
  if (ec)
    return EX_OUTPUT;
  if (sz < 512)
    return EX_OUTPUT;
  return 0;
}

} // namespace

int main(int argc, char** argv) {
  signal(SIGPIPE, SIG_IGN);

  Options opt;
  const int px = parse_args(argc, argv, opt);
  if (px == kParseHelp)
    return 0;
  if (px != 0)
    return px;

  ClipMeta meta;
  const int pr = braw_probe_clip(opt.input, meta);
  if (pr != 0)
    return pr;

  uint32_t dec_w = 0;
  uint32_t dec_h = 0;
  braw_dimensions_for_target_width(meta.clip_width, meta.clip_height, opt.width, dec_w, dec_h);

  int pipefd[2];
  if (::pipe(pipefd) != 0) {
    perror("pipe");
    return EX_FFMPEG_SPAWN;
  }

  posix_spawn_file_actions_t fa;
  if (posix_spawn_file_actions_init(&fa) != 0) {
    close(pipefd[0]);
    close(pipefd[1]);
    return EX_FFMPEG_SPAWN;
  }
  if (posix_spawn_file_actions_adddup2(&fa, pipefd[0], STDIN_FILENO) != 0 || posix_spawn_file_actions_addclose(&fa, pipefd[1]) != 0
      || posix_spawn_file_actions_addclose(&fa, pipefd[0]) != 0) {
    posix_spawn_file_actions_destroy(&fa);
    close(pipefd[0]);
    close(pipefd[1]);
    return EX_FFMPEG_SPAWN;
  }

  const std::string vf = "scale=" + std::to_string(opt.width) + ":-2";

  std::vector<std::string> arg_store;
  arg_store.reserve(32);
  arg_store.push_back(opt.ffmpeg);
  arg_store.push_back("-hide_banner");
  arg_store.push_back("-loglevel");
  arg_store.push_back("error");
  arg_store.push_back("-f");
  arg_store.push_back("rawvideo");
  arg_store.push_back("-pixel_format");
  arg_store.push_back("rgba");
  arg_store.push_back("-video_size");
  arg_store.push_back(std::to_string(dec_w) + "x" + std::to_string(dec_h));
  arg_store.push_back("-framerate");
  arg_store.push_back(framerate_arg(meta));
  arg_store.push_back("-i");
  arg_store.push_back("-");
  if (opt.width > 0) {
    arg_store.push_back("-vf");
    arg_store.push_back(vf);
  }
  arg_store.push_back("-c:v");
  arg_store.push_back("libx264");
  arg_store.push_back("-preset");
  arg_store.push_back("fast");
  arg_store.push_back("-crf");
  arg_store.push_back(std::to_string(opt.crf));
  arg_store.push_back("-pix_fmt");
  arg_store.push_back("yuv420p");
  arg_store.push_back("-movflags");
  arg_store.push_back("+faststart");
  arg_store.push_back("-an");
  arg_store.push_back("-y");
  arg_store.push_back(opt.output);

  std::vector<char*> argv_spawn;
  argv_spawn.reserve(arg_store.size() + 1);
  for (auto& s : arg_store)
    argv_spawn.push_back(s.data());
  argv_spawn.push_back(nullptr);

  pid_t pid = -1;
  const int sp = posix_spawn(&pid, opt.ffmpeg.c_str(), &fa, nullptr, argv_spawn.data(), environ);
  posix_spawn_file_actions_destroy(&fa);
  close(pipefd[0]);

  if (sp != 0) {
    perror("posix_spawn");
    close(pipefd[1]);
    return EX_FFMPEG_SPAWN;
  }

  BrawDecodeConfig dcfg;
  dcfg.target_width = opt.width;
  dcfg.max_frames = opt.max_frames;

  const int dr = braw_decode_frames(opt.input, dcfg, meta,
    [&](const uint8_t* pixels, uint32_t row_bytes, uint32_t w, uint32_t h, uint64_t frame_index) -> bool {
      if (w != dec_w || h != dec_h) {
        std::cerr << "Decoded frame size " << w << "x" << h << " != expected " << dec_w << "x" << dec_h << "\n";
        return false;
      }
      const size_t nbytes = static_cast<size_t>(row_bytes) * static_cast<size_t>(h);
      if (write_all(pipefd[1], pixels, nbytes) < 0) {
        std::cerr << "Write to ffmpeg pipe failed (broken pipe or disk full)\n";
        return false;
      }
      if (frame_index == 0) {
        braw_runtime_debug_log(
          "first frame handed to ffmpeg (%ux%u row_bytes=%u bytes=%zu)", w, h, row_bytes, nbytes);
      }
      return true;
    });

  close(pipefd[1]);

  int status = 0;
  if (waitpid(pid, &status, 0) < 0) {
    perror("waitpid");
    if (dr != 0)
      return dr;
    return EX_FFMPEG_EXIT;
  }

  if (dr != 0)
    return dr;

  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
    std::cerr << "ffmpeg exited abnormally (status " << status << ")\n";
    return EX_FFMPEG_EXIT;
  }

  const int vv = validate_output_file(opt.output);
  if (vv != 0)
    return vv;
  return 0;
}
