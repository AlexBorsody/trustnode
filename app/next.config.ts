import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static-friendly: the leaderboard and project pages render from JSON
  // snapshots at build/request time. No upstream API calls from page loads.
};

export default nextConfig;
