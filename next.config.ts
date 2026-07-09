import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"],
    "/api/**/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"],
    "/api/conversations/[id]/messages": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"],
    "/api/meta/webhook": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"]
  }
};

export default nextConfig;
