import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
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

  // 레거시 제로보드 URL 리다이렉트는 src/middleware.ts 에서 전담한다.
  // next.config.ts 의 redirects() 는 `has: query` 로 매칭은 되지만
  // 그 외 쿼리스트링(page/keyword/category/sn/ss/sc 등)을
  // destination 에 자동으로 실어주지 않아 링크가 끊긴다.
  // 따라서 여기서는 제거하고 middleware 한 곳에서 모든 파라미터를
  // 보존하며 리다이렉트한다.
};

export default nextConfig;
