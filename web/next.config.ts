import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run beside the dev server without sharing .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
