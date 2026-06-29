import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server actions used by the editor save workflow.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

export default nextConfig;
