import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // 启用压缩
  compress: true,

  // 优化图片
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Pin Turbopack to this repository so parent lockfiles do not affect root inference.
  turbopack: {
    root: projectRoot,
  },

  // Headers 优化
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
