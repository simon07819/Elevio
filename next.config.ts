import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  crons: [
    {
      path: "/api/cron/cleanup-requests",
      schedule: "0 * * * *",
    },
    {
      path: "/api/cron/compute-stats",
      schedule: "0 3 * * *",
    },
  ],
};

export default nextConfig;
