import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用压缩
  compress: true,

  // 优化图片
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // 实验性功能
  experimental: {
    // 优化 CSS
    optimizeCss: true,
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
