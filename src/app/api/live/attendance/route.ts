import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { verifyCaptcha } from "@/lib/captcha";
import { findCurrentInstance } from "@/lib/serviceInstance";

// POST /api/live/attendance — 실시간 예배 참여 등록 (단위 예배 매핑 + 중복 제한)
//
// Body: { names: string[], sessionId?: string, captchaAnswer?, captchaToken? }
// 정책:
//  - 진행 중(또는 grace) ServiceInstance 가 있어야 등록 허용
//  - 로그인 회원: 같은 ServiceInstance 에 1회 (`@@unique(serviceInstanceId, userId)`)
//      → 다인원(가족) 도 1 row 만 생성하되 names 가 여러 명이면 첫째가 본인,
//        나머지는 별 row (userId=null) 로 저장
//  - 비회원: 같은 (ServiceInstance, IP) 에 30 row 상한, 1분 내 재등록 차단
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP 당 3회/분
    const rlIp = getClientIp(request);
    const rl = checkRateLimit(`live-att:${rlIp}`, 3, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } },
      );
    }

    const body = await request.json();
    const names: string[] = body.names;
    const sessionIdRaw: string = typeof body.sessionId === "string" ? body.sessionId : "";
    const captchaAnswer: string = typeof body.captchaAnswer === "string" ? body.captchaAnswer : "";
    const captchaToken: string = typeof body.captchaToken === "string" ? body.captchaToken : "";

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ message: "이름을 입력해 주세요." }, { status: 400 });
    }

    // 세션 확인
    const sessionToken = request.cookies.get("dc_session")?.value;
    let isSessionValid = false;
    let sessionUserId: number | null = null;
    if (sessionToken) {
      const session = await prisma.session.findUnique({ where: { sessionToken } });
      if (session && session.expires > new Date()) {
        isSessionValid = true;
        sessionUserId = session.userId;
      }
    }

    // 비로그인 시 CAPTCHA
    if (!isSessionValid) {
      if (!captchaAnswer || !captchaToken || !verifyCaptcha(captchaAnswer, captchaToken)) {
        return NextResponse.json({ message: "보안 문자가 올바르지 않습니다." }, { status: 400 });
      }
    }

    // 진행 중 ServiceInstance 확인 (없으면 등록 거부)
    const current = await findCurrentInstance(new Date(), 30);
    if (!current) {
      return NextResponse.json(
        { message: "지금은 예배 시간이 아닙니다. 예배 진행 중에만 등록할 수 있습니다." },
        { status: 400 },
      );
    }
    const serviceInstanceId = current.instance.id;

    const cleaned = names
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter((n) => n.length > 0 && n.length <= 100)
      .slice(0, 20);

    if (cleaned.length === 0) {
      return NextResponse.json({ message: "유효한 이름이 없습니다." }, { status: 400 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const sessionId = sessionIdRaw ? sessionIdRaw.slice(0, 64) : null;

    // 1) 로그인 회원: 같은 예배에 이미 등록한 row 가 있으면 그 row 의 name 만 갱신(첫째)
    //    + 나머지 names 는 userId=null 로 가족 row 로 추가
    if (sessionUserId) {
      const existing = await prisma.liveAttendance.findFirst({
        where: { serviceInstanceId, userId: sessionUserId },
        select: { id: true },
      });

      const [selfName, ...familyNames] = cleaned;

      // 본인 row — upsert 패턴 (unique constraint 활용 가능하나 prisma upsert 가
      // composite unique 에 어색해서 if 분기로 처리)
      if (existing) {
        await prisma.liveAttendance.update({
          where: { id: existing.id },
          data: { name: selfName, ip, sessionId },
        });
      } else {
        await prisma.liveAttendance.create({
          data: {
            name: selfName,
            ip,
            sessionId,
            userId: sessionUserId,
            serviceInstanceId,
          },
        });
      }

      // 가족 — 같은 (serviceInstanceId, name) 가 이 sessionId 로 이미 있는지 확인
      // 없으면 추가, 있으면 skip
      if (familyNames.length > 0) {
        const existingFamily = await prisma.liveAttendance.findMany({
          where: {
            serviceInstanceId,
            sessionId,
            userId: null,
            name: { in: familyNames },
          },
          select: { name: true },
        });
        const have = new Set(existingFamily.map((r) => r.name));
        const toCreate = familyNames.filter((n) => !have.has(n));
        if (toCreate.length > 0) {
          await prisma.liveAttendance.createMany({
            data: toCreate.map((name) => ({
              name,
              ip,
              sessionId,
              userId: null,
              serviceInstanceId,
            })),
          });
        }
      }

      return NextResponse.json({
        message: `${cleaned.length}명 등록되었습니다.`,
        count: cleaned.length,
        serviceInstance: {
          id: current.instance.id,
          label: current.instance.label,
        },
      });
    }

    // 2) 비회원: 같은 (serviceInstanceId, IP) 의 1분 내 재등록 차단
    const recentCutoff = new Date(Date.now() - 60_000);
    const recent = await prisma.liveAttendance.findFirst({
      where: { serviceInstanceId, ip, createdAt: { gte: recentCutoff } },
      select: { id: true },
    });
    if (recent) {
      return NextResponse.json(
        { message: "방금 등록하셨습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
    }
    // 같은 (serviceInstanceId, IP) 누적 30 row 상한
    const ipCount = await prisma.liveAttendance.count({
      where: { serviceInstanceId, ip },
    });
    if (ipCount + cleaned.length > 30) {
      return NextResponse.json(
        { message: "이 위치에서 등록 가능한 수를 초과했습니다." },
        { status: 400 },
      );
    }

    await prisma.liveAttendance.createMany({
      data: cleaned.map((name) => ({
        name,
        ip,
        sessionId,
        userId: null,
        serviceInstanceId,
      })),
    });

    return NextResponse.json({
      message: `${cleaned.length}명 등록되었습니다.`,
      count: cleaned.length,
      serviceInstance: {
        id: current.instance.id,
        label: current.instance.label,
      },
    });
  } catch (err) {
    console.error("실시간 참여 등록 오류:", err);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
