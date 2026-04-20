/**
 * Dev: prefer `bun run dev` (webpack). Turbopack: `bun run dev:turbo`.
 *
 * If you see `Cannot find module './548.js'` (or similar) under `.next/server/webpack-runtime.js`,
 * the build output is stale or torn. Stop the server, run `bun run clean`, then `bun run dev`
 * (or `bun run dev:fresh` in one step). Do not switch Turbopack ↔ webpack without cleaning.
 * Avoid saving this file while `next dev` is running.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Do not use `optimizePackageImports: ["lucide-react"]` with Turbopack: it is not
     * applied correctly and can contribute to lucide barrel load failures (stack overflow).
     * Import icons from `lucide-react` normally (barrel); tree-shaking still applies at build.
     */
    turbo: {
      treeShaking: true,
    },
  },
};

export default nextConfig;
