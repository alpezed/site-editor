import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // recast runs server-side only (src/lib/editor/stamp.ts). Don't bundle it —
  // its runtime `require("babylon")` fallback is unresolvable at bundle time.
  serverExternalPackages: ["recast"],
  // Section component sources are read from disk at save/sync time
  // (catalog-source.ts). Ship them in the serverless bundle so
  // process.cwd() resolves them on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./sandbox-templates/_shared/components/**/*.tsx"],
  },
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
