import type { NextRequest } from "next/server";

/**
 * 요청이 실제로 HTTPS 로 왔는지 판정.
 * Nginx 가 proxy_set_header X-Forwarded-Proto $scheme; 을 설정한 경우
 * 그 값을 우선 사용, 없으면 URL 의 scheme 으로 판정.
 *
 * 쿠키의 `secure` 플래그를 프로세스 NODE_ENV 기반으로 하드코딩하면,
 * HTTP 배포 중인 프로덕션에서 브라우저가 쿠키를 저장조차 안 해 로그인
 * 상태가 유지되지 않는다. 요청 단위로 판정해 HTTPS 일 때만 Secure.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const xfp = request.headers.get("x-forwarded-proto");
  if (xfp) return xfp.split(",")[0].trim().toLowerCase() === "https";
  try {
    return request.nextUrl.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Server Component 에서 next/headers 의 headers() 결과로부터 판정.
 */
export function isSecureFromHeaders(h: Headers): boolean {
  const xfp = h.get("x-forwarded-proto");
  if (xfp) return xfp.split(",")[0].trim().toLowerCase() === "https";
  return false;
}
