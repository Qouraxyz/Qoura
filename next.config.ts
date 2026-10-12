import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next writes agent instruction files at the repo root unless this is off.
  // The public repository carries no Markdown but its README.
  agentRules: false,
  // Put metadata in <head> for every client, so titles, canonicals and share
  // cards are in the first HTML any crawler or link previewer reads.
  htmlLimitedBots: /.*/,
  // Lets a second build (local fork tests) live next to the production one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The gateway answers at /v1/..., the base URL OpenAI clients expect.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: "/api/v1/:path*" }];
  },
};

export default nextConfig;
