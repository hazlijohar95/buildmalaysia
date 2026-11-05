import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run beside the dev server without sharing .next.
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  eslint: {
    ignoreDuringBuilds: false,
  },
  // The only images are two portraits already sized to 640px, so there is nothing for an optimizer to do.
  images: { unoptimized: true },
};

export default nextConfig;
