import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1gb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pkistdc.net",
      },
    ],
  },

  // 레거시 제로보드 URL 리다이렉트
  async redirects() {
    return [
      {
        source: "/bbs/zboard.php",
        has: [{ type: "query", key: "id", value: "(?<boardId>.*)" }],
        destination: "/board/:boardId",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
