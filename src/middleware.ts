import { NextRequest, NextResponse } from "next/server";

// ============================================================
// 제로보드 레거시 URL → 새 URL 리다이렉트
//
// 기존 링크가 끊어지지 않도록 301 리다이렉트 처리하면서
// category/page/keyword/sn/ss/sc 등 검색/페이징 쿼리스트링을
// 전부 목적지 URL 로 포워딩한다.
//
// 예시:
//   /bbs/zboard.php?id=DcNotice&page=2&keyword=감사
//     → /board/DcNotice?page=2&keyword=감사
//   /bbs/view.php?id=DcNotice&no=123&page=2&category=1
//     → /board/DcNotice/123?page=2&category=1
//   /bbs/write.php?id=DcNotice&mode=reply&no=123
//     → /board/DcNotice/write?mode=reply&no=123
//   /bbs/login.php?url=/some/path
//     → /auth/login?redirect=/some/path
//   /bbs/admin.php → /admin
// ============================================================

// 목적지에 그대로 실어 보낼 레거시 검색/페이징 파라미터 목록
const FORWARD_KEYS = [
  "category",
  "page",
  "keyword",
  "sn", // search name
  "ss", // search subject
  "sc", // search content
  "sm", // search memo/etc
  "select_arrange", // 정렬 기준
  "desc", // 정렬 방향
];

// 주어진 searchParams 중 FORWARD_KEYS 에 해당하는 것만 복사해서
// 쿼리스트링으로 직렬화한다. 값이 있는 키만 포함.
function forwardQuery(
  searchParams: URLSearchParams,
  extraSkip: string[] = []
): string {
  const params = new URLSearchParams();
  for (const key of FORWARD_KEYS) {
    if (extraSkip.includes(key)) continue;
    const v = searchParams.get(key);
    if (v) params.set(key, v);
  }
  return params.toString();
}

function buildUrl(path: string, qs: string, base: string): URL {
  return new URL(qs ? `${path}?${qs}` : path, base);
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // ---- 제로보드 레거시 리다이렉트 ----

  // zboard.php → /board/[boardId]
  // 예: /bbs/zboard.php?id=DcNotice&page=2&keyword=감사
  //     → /board/DcNotice?page=2&keyword=감사
  if (pathname.endsWith("/zboard.php") || pathname.endsWith("/zboard.php/")) {
    const id = searchParams.get("id");
    if (id) {
      const qs = forwardQuery(searchParams);
      return NextResponse.redirect(
        buildUrl(`/board/${id}`, qs, request.url),
        301
      );
    }
  }

  // view.php → /board/[boardId]/[postId]
  // 예: /bbs/view.php?id=DcNotice&no=123&page=2&category=1
  //     → /board/DcNotice/123?page=2&category=1
  if (pathname.endsWith("/view.php") || pathname.endsWith("/view.php/")) {
    const id = searchParams.get("id");
    const no = searchParams.get("no");
    if (id && no) {
      const qs = forwardQuery(searchParams);
      return NextResponse.redirect(
        buildUrl(`/board/${id}/${no}`, qs, request.url),
        301
      );
    }
  }

  // write.php → /board/[boardId]/write
  // mode 와 no 는 write 페이지가 직접 사용하는 파라미터라 유지한다.
  // 예: /bbs/write.php?id=DcNotice&mode=reply&no=123&category=1
  //     → /board/DcNotice/write?mode=reply&no=123&category=1
  if (pathname.endsWith("/write.php") || pathname.endsWith("/write.php/")) {
    const id = searchParams.get("id");
    if (id) {
      const mode = searchParams.get("mode") || "write";
      const no = searchParams.get("no");
      const extra = forwardQuery(searchParams);
      const params = new URLSearchParams(extra);
      params.set("mode", mode);
      if (no) params.set("no", no);
      return NextResponse.redirect(
        buildUrl(`/board/${id}/write`, params.toString(), request.url),
        301
      );
    }
  }

  // login.php → /auth/login
  // 레거시 제로보드는 돌아갈 URL 을 `url` 파라미터로 전달했기 때문에
  // 새 로그인 페이지가 기대하는 `redirect` 로 변환해준다.
  if (pathname.endsWith("/login.php") || pathname.endsWith("/login.php/")) {
    const back = searchParams.get("url") || searchParams.get("redirect");
    const params = new URLSearchParams();
    if (back) params.set("redirect", back);
    const qs = params.toString();
    return NextResponse.redirect(
      buildUrl("/auth/login", qs, request.url),
      301
    );
  }

  // admin.php → /admin
  if (pathname.endsWith("/admin.php") || pathname.endsWith("/admin.php/")) {
    return NextResponse.redirect(new URL("/admin", request.url), 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/bbs/:path*",
    "/(.*)\\.php",
  ],
};
