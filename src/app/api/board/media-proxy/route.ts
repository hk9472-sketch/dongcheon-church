import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// ────────────────────────────────────────────────────────────
// GET /api/board/media-proxy?src=<URL>
//
// HTTPS 페이지에서 HTTP 외부 미디어를 <video src> / <audio src> 로 인라인 재생할 때
// Mixed Content 차단을 우회하려고 자체 서버를 경유시키는 프록시.
// media-download 와 달리 Content-Disposition 안 붙임 (브라우저 인라인 재생).
// HTTP Range 헤더는 그대로 통과 → 비디오 seek 동작.
//
// 보안: SSRF 방지를 위해 허용 호스트 화이트리스트 (media-download 와 동일 정책).
// ────────────────────────────────────────────────────────────

const STATIC_ALLOWED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.vimeo.com",
  "vimeo.com",
  "tv.kakao.com",
  "play-tv.kakao.com",
  "tv.naver.com",
  "serviceapi.nmv.naver.com",
  "soklee88.ipdisk.co.kr",
];

async function getAllowedHosts(): Promise<string[]> {
  const hosts = new Set(STATIC_ALLOWED_HOSTS);
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: "media_base_url" } });
    if (row?.value) {
      try {
        const u = new URL(row.value);
        hosts.add(u.hostname);
      } catch {
        /* 잘못된 URL 무시 */
      }
    }
  } catch {
    /* DB 오류 시 정적 리스트만 사용 */
  }
  return Array.from(hosts);
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");
  if (!src) return NextResponse.json({ error: "src 필요" }, { status: 400 });

  // 자체 서버 경로면 그대로 리다이렉트
  if (src.startsWith("/")) {
    return NextResponse.redirect(new URL(src, request.url));
  }

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ error: "잘못된 URL" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "http/https 만 허용" }, { status: 400 });
  }

  const allowed = await getAllowedHosts();
  if (!allowed.includes(target.hostname)) {
    return NextResponse.json(
      { error: `허용되지 않은 호스트: ${target.hostname}` },
      { status: 403 }
    );
  }

  // Range 헤더 전달 (비디오 seek 동작 위해)
  const fwdHeaders: Record<string, string> = {
    "User-Agent": "dongcheon-church-proxy/1.0",
  };
  const range = request.headers.get("range");
  if (range) fwdHeaders["Range"] = range;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: fwdHeaders,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    return NextResponse.json(
      { error: `원본 서버 연결 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
  clearTimeout(timeoutId);

  if (!upstream.body) {
    return NextResponse.json(
      { error: `원본 서버 응답 실패: HTTP ${upstream.status}` },
      { status: 502 }
    );
  }

  // 응답 헤더 — Content-Type, Content-Length, Accept-Ranges, Content-Range 통과
  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
  };
  const passHeaders = ["content-length", "accept-ranges", "content-range", "last-modified", "etag"];
  for (const h of passHeaders) {
    const v = upstream.headers.get(h);
    if (v) headers[h.replace(/(^|-)([a-z])/g, (_, p, c) => p + c.toUpperCase())] = v;
  }

  return new NextResponse(upstream.body, {
    status: upstream.status, // 200 또는 206 (partial content)
    headers,
  });
}
