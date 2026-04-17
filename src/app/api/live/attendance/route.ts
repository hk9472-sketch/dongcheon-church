import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { verifyCaptcha } from "@/lib/captcha";

// 한국시간 현재 시각
function nowKST(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

// POST /api/live/attendance - 실시간 예배 참여 등록
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 3회/분 (스팸 도배 방지)
    const rlIp = getClientIp(request);
    const rl = checkRateLimit(`live-att:${rlIp}`, 3, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
      );
    }

    const body = await request.json();
    const names: string[] = body.names;
    const captchaAnswer: string = typeof body.captchaAnswer === "string" ? body.captchaAnswer : "";
    const captchaToken: string = typeof body.captchaToken === "string" ? body.captchaToken : "";

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ message: "이름을 입력해 주세요." }, { status: 400 });
    }

    // 세션 확인 (로그인 사용자는 CAPTCHA 생략)
    const sessionToken = request.cookies.get("dc_session")?.value;
    let isSessionValid = false;
    if (sessionToken) {
      const session = await prisma.session.findUnique({ where: { sessionToken } });
      if (session && session.expires > new Date()) {
        isSessionValid = true;
      }
    }

    // 비로그인 시 CAPTCHA 검증
    if (!isSessionValid) {
      if (!captchaAnswer || !captchaToken || !verifyCaptcha(captchaAnswer, captchaToken)) {
        return NextResponse.json({ message: "보안 문자가 올바르지 않습니다." }, { status: 400 });
      }
    }

    const cleaned = names
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter((n) => n.length > 0 && n.length <= 100)
      .slice(0, 20);

    if (cleaned.length === 0) {
      return NextResponse.json({ message: "유효한 이름이 없습니다." }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    const kstNow = nowKST();

    await prisma.liveAttendance.createMany({
      data: cleaned.map((name) => ({ name, ip, createdAt: kstNow })),
    });

    return NextResponse.json({ message: `${cleaned.length}명 등록되었습니다.`, count: cleaned.length });
  } catch (err) {
    console.error("실시간 참여 등록 오류:", err);
    return NextResponse.json({ message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
