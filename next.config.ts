import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/**/*": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/conversations/[id]/messages": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/meta/webhook": ["./node_modules/ffmpeg-static/ffmpeg"]
  }
};

export default nextConfig;
