import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { isSecureRequest } from "@/lib/cookieSecure";

// ============================================================
// POST /api/board/view — 게시글 조회수 증가
// - 24시간 동안 같은 사용자의 중복 증가 방지 (dc_view_<postId> 쿠키)
// - Route Handler 에서는 cookies().set() 이 안정적으로 동작하므로
//   기존 Server Component 에서 쿠키 쓰기가 실패해 카운트가 무한 증가하던 문제 해결.
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const postId = Number(body.postId);
    if (!postId || !Number.isFinite(postId) || postId <= 0) {
      return NextResponse.json({ error: "invalid postId" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const viewCookie = `dc_view_${postId}`;
    if (cookieStore.get(viewCookie)?.value) {
      return NextResponse.json({ incremented: false, reason: "already-viewed" });
    }

    // 게시글 존재 확인은 생략 — 존재하지 않으면 UPDATE 영향 0행으로 무해
    await prisma.$executeRaw`UPDATE posts SET hit = hit + 1 WHERE id = ${postId}`;

    cookieStore.set(viewCookie, "1", {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24시간
      path: "/",
    });

    return NextResponse.json({ incremented: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
