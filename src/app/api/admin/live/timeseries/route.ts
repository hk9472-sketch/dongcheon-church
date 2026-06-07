import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/admin/live/timeseries?serviceInstanceId=N
 *
 * 한 예배(ServiceInstance) 의 1분 단위 시계열 반환:
 *  - web:     /live, /live-worship 진입 사용자가 분 단위로 몇 명 누적되는지
 *             (sessionId 또는 IP+UA 기준 distinct)
 *  - youtube: LiveYoutubeMinuteStat 의 concurrent (그 분의 마지막 값)
 *
 * 응답:
 *  { startAt, endAt, points: [{ minute: "HH:MM", web, webDelta, youtube }] }
 *  - web        = 누적값 (그 시점까지의 distinct 합)
 *  - webDelta   = 직전 분 대비 증가량 (그래프 위 "+N" 표시용)
 *  - youtube    = 그 분의 동시 시청자
 */
// 공개 — 응답에 IP/UA 같은 민감 정보 없음, 분 단위 집계 수치만.
export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("serviceInstanceId");
  const id = parseInt(idStr || "", 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "serviceInstanceId 필요" }, { status: 400 });
  }

  const inst = await prisma.serviceInstance.findUnique({
    where: { id },
    select: { code: true, serviceDate: true, startAt: true, endAt: true },
  });
  if (!inst) return NextResponse.json({ error: "예배 없음" }, { status: 404 });

  // web — VisitLog 1분 group by distinct sessionId/IP+UA
  // (자연스러운 SQL group by 가 distinct 와 함께 까다로워서 JS 처리)
  const visits = await prisma.visitLog.findMany({
    where: {
      path: { in: ["/live", "/live-worship"] },
      createdAt: { gte: inst.startAt, lt: inst.endAt },
    },
    select: { createdAt: true, sessionId: true, ip: true, userAgent: true },
    orderBy: { createdAt: "asc" },
  });

  // 1분 슬롯 만들기 (KST 분 단위)
  const startKstMin = kstMinOf(inst.startAt);
  const endKstMin = kstMinOf(inst.endAt);
  const slots: {
    minute: number; // KST 자정 기준 분 (0~1439)
    label: string; // "HH:MM"
    web: number;
    webDelta: number;
    youtube: number | null;
  }[] = [];
  for (let m = startKstMin; m < endKstMin; m++) {
    slots.push({
      minute: m,
      label: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      web: 0,
      webDelta: 0,
      youtube: null,
    });
  }

  // 누적 visit — sessionId 또는 (ip + UA prefix) 기준 첫 등장 분에 +1
  const seen = new Set<string>();
  const visitDeltaPerMin = new Map<number, number>();
  for (const v of visits) {
    const m = kstMinOf(v.createdAt);
    const key = v.sessionId
      ? `s:${v.sessionId}`
      : `ip:${v.ip}:${(v.userAgent || "").slice(0, 24)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visitDeltaPerMin.set(m, (visitDeltaPerMin.get(m) || 0) + 1);
  }
  let acc = 0;
  for (const s of slots) {
    const d = visitDeltaPerMin.get(s.minute) || 0;
    acc += d;
    s.web = acc;
    s.webDelta = d;
  }

  // youtube — LiveYoutubeMinuteStat
  const yt = await prisma.liveYoutubeMinuteStat.findMany({
    where: { serviceCode: inst.code, serviceDate: inst.serviceDate },
    select: { minuteKst: true, concurrent: true },
  });
  const ytMap = new Map(yt.map((y) => [y.minuteKst, y.concurrent]));
  for (const s of slots) {
    const v = ytMap.get(s.minute);
    if (typeof v === "number") s.youtube = v;
  }

  return NextResponse.json({
    serviceInstanceId: id,
    startAt: inst.startAt,
    endAt: inst.endAt,
    points: slots,
  });
}

/** Date → KST 자정 기준 분 (0~1439). 날짜 경계 무시(같은 날 가정). */
function kstMinOf(d: Date): number {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}
