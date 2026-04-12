import { NextRequest, NextResponse } from "next/server";

// ============================================================
// 제로보드 레거시 URL → 새 URL 리다이렉트
//
// 기존 링크가 끊어지지 않도록 301 리다이렉트 처리
// 예: /bbs/zboard.php?id=DcNotice → /board/DcNotice
//     /bbs/view.php?id=DcNotice&no=123 → /board/DcNotice/123
// ============================================================

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // ---- 제로보드 레거시 리다이렉트 ----

  // zboard.php → /board/[boardId]
  if (pathname.endsWith("/zboard.php") || pathname.endsWith("/zboard.php/")) {
    const id = searchParams.get("id");
    if (id) {
      const page = searchParams.get("page");
      const newUrl = new URL(`/board/${id}`, request.url);
      if (page) newUrl.searchParams.set("page", page);
      const keyword = searchParams.get("keyword");
      if (keyword) newUrl.searchParams.set("keyword", keyword);
      return NextResponse.redirect(newUrl, 301);
    }
  }

  // view.php → /board/[boardId]/[postId]
  if (pathname.endsWith("/view.php") || pathname.endsWith("/view.php/")) {
    const id = searchParams.get("id");
    const no = searchParams.get("no");
    if (id && no) {
      return NextResponse.redirect(
        new URL(`/board/${id}/${no}`, request.url),
        301
      );
    }
  }

  // write.php → /board/[boardId]/write
  if (pathname.endsWith("/write.php") || pathname.endsWith("/write.php/")) {
    const id = searchParams.get("id");
    if (id) {
      const mode = searchParams.get("mode") || "write";
      const no = searchParams.get("no");
      const newUrl = new URL(`/board/${id}/write`, request.url);
      newUrl.searchParams.set("mode", mode);
      if (no) newUrl.searchParams.set("no", no);
      return NextResponse.redirect(newUrl, 301);
    }
  }

  // login.php → /auth/login
  if (pathname.endsWith("/login.php")) {
    return NextResponse.redirect(new URL("/auth/login", request.url), 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/bbs/:path*",
    "/(.*)\\.php",
  ],
};
