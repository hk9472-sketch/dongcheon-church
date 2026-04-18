import type { NextConfig } from "next";

// Content-Security-Policy: TipTap/YouTube 임베드/인라인 스타일 허용 포함한 운영용 정책.
// 'unsafe-inline' style 은 TipTap 및 기존 인라인 스타일 호환성 때문에 유지.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtube.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

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

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  // 레거시 제로보드 URL 리다이렉트는 src/middleware.ts 에서 전담한다.
  // next.config.ts 의 redirects() 는 `has: query` 로 매칭은 되지만
  // 그 외 쿼리스트링(page/keyword/category/sn/ss/sc 등)을
  // destination 에 자동으로 실어주지 않아 링크가 끊긴다.
  // 따라서 여기서는 제거하고 middleware 한 곳에서 모든 파라미터를
  // 보존하며 리다이렉트한다.
};

export default nextConfig;
