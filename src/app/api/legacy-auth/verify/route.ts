import { NextRequest, NextResponse } from "next/server";
import { verifyLegacyToken } from "@/lib/legacyToken";

// GET /api/legacy-auth/verify
// nginx auth_request 서브요청 처리. 토큰 유효 → 200, 무효 → 401.
// 응답 본문은 사용하지 않음 — 상태코드만 의미가 있음.
export async function GET(request: NextRequest) {
  const token = request.cookies.get("dc_legacy_token")?.value || "";
  const payload = verifyLegacyToken(token);
  if (!payload) {
    return new NextResponse(null, { status: 401 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      "X-Legacy-User-Id": String(payload.userId),
      "Cache-Control": "no-store",
    },
  });
}
