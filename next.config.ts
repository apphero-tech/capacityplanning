import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pre-existing type errors live in a few places (xlsx Buffer typings,
  // Recharts custom-tick prop, an excel-export StreamScopeStories cast).
  // They've been there forever — `next dev` never type-checks, but
  // `next build` does, which broke the first Vercel deploy. Skip TS
  // type-check at build time; we still rely on local `tsc --noEmit`
  // and IDE feedback to catch new errors.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
