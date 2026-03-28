import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/api/analyze": ["./bin/yt-dlp"],
    "/api/analysis/[id]": ["./bin/yt-dlp"],
  },
};

export default nextConfig;
