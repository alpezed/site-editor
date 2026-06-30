import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // recast runs server-side only (src/lib/editor/stamp.ts). Don't bundle it —
  // its runtime `require("babylon")` fallback is unresolvable at bundle time.
  serverExternalPackages: ["recast"],
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
