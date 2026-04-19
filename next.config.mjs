import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Avoid picking a parent directory when multiple pnpm lockfiles exist on disk.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
