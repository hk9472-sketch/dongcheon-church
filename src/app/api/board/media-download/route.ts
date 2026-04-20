import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// ────────────────────────────────────────────────────────────
// GET /api/board/media-download?src=<URL>&name=<filename>
// 외부 도메인(예: soklee88.ipdisk.co.kr) 미디어를 자체 서버로 중계하면서
// Content-Disposition: attachment 를 붙여 브라우저가 실제 다운로드로 인식하게 한다.
// 직접 <a download href="http://외부/..."> 는 CORS 제한으로 브라우저가 무시하므로 필요한 우회.
//
// 보안
// - SSRF 방지: 허용 호스트 화이트리스트 — sanitize 의 ALLOWED_IFRAME_HOSTS 와
//   사이트 설정 media_base_url 의 호스트만 통과.
// - 파일 크기 제한 없음(미디어라 큰 파일 허용) 하지만 타임아웃 120초.
// - 로컬 업로드 경로(/api/board/media 또는 /data/) 는 자체 파일이라 그대로 허용.
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

function pickFilename(url: URL, override?: string | null): string {
  if (override) {
    // 안전한 파일명만 허용
    const safe = override.replace(/[\\/]+/g, "_").replace(/[^\w가-힣.\-\s()[\]]/g, "_").slice(0, 200);
    if (safe) return safe;
  }
  const lastSeg = url.pathname.split("/").filter(Boolean).pop() || "download";
  return decodeURIComponent(lastSeg).slice(0, 200);
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");
  const nameOverride = request.nextUrl.searchParams.get("name");

  if (!src) return NextResponse.json({ error: "src 필요" }, { status: 400 });

  // 자체 서버 경로면 그냥 리다이렉트 (/api/board/media?path=..., /data/...)
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

  // 외부 서버에서 파일 가져오기 — Range 헤더는 전달하지 않음(전체 다운로드 전제)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "dongcheon-church-proxy/1.0" },
    });
  } catch (e) {
    clearTimeout(timeoutId);
    return NextResponse.json(
      { error: `원본 서버 연결 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
  clearTimeout(timeoutId);

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `원본 서버 응답 실패: HTTP ${upstream.status}` },
      { status: 502 }
    );
  }

  const filename = pickFilename(target, nameOverride);
  // RFC 5987 로 한글 파일명 안전 인코딩
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encoded}`,
    "Cache-Control": "private, no-store",
  };
  if (contentLength) headers["Content-Length"] = contentLength;

  return new NextResponse(upstream.body, { status: 200, headers });
}
