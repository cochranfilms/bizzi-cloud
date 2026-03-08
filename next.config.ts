import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/backup/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/backup/generate-proxy": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/backup/download-with-lut": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/shares/[token]/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/transfers/[slug]/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
};

export default nextConfig;
