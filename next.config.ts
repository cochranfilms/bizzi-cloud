import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "sharp",
    "ffmpeg-static",
    "ffprobe-static",
    "@napi-rs/canvas",
    "pdfjs-dist",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "*.google.com", pathname: "/**" },
      { protocol: "https", hostname: "*.firebasestorage.googleapis.com", pathname: "/**" },
      { protocol: "https", hostname: "*.gravatar.com", pathname: "/**" },
      { protocol: "https", hostname: "*.facebook.com", pathname: "/**" },
      { protocol: "https", hostname: "*.githubusercontent.com", pathname: "/**" },
    ],
  },
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
    /** Required on Vercel: serverless bundle must include the ffmpeg binary or probes never run (list shows Not scanned yet / Unscanned forever). */
    "/api/files/extract-metadata": [
      "./node_modules/ffmpeg-static/ffmpeg",
    ],
    /** Creator RAW finalize: ffprobe only; trace linux/x64 binary (not full ffprobe-static/bin ~335 MB). */
    "/api/uppy/presigned-complete": [
      "./node_modules/ffprobe-static/bin/linux/x64/ffprobe",
    ],
    "/api/uppy/s3/multipart/[uploadId]/complete": [
      "./node_modules/ffprobe-static/bin/linux/x64/ffprobe",
    ],
    "/api/backup/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/backup/generate-proxy": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/shares/[token]/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/transfers/[slug]/video-thumbnail": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/backup/pdf-thumbnail": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
    ],
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
};

export default nextConfig;
