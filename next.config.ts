import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// In development, let phones on the same Wi-Fi load the app through this
// laptop's local IP address (e.g. http://192.168.1.23:3000).
const localIps = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: localIps,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
