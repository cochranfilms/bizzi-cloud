import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "ffmpeg-static"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/backup/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/backup/generate-proxy": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/shares/[token]/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/transfers/[slug]/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
};

export default nextConfig;
