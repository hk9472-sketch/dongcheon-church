import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { listInstancesByDate, DWELL_MIN_SEC } from "@/lib/serviceInstance";
import { requireAdminOrCouncil } from "@/lib/adminCouncilAuth";

/**
 * GET /api/admin/live/service-stats?date=YYYY-MM-DD
 *
 * 그날의 ServiceInstance 별로 3출처(자기보고 / 웹체류 / 유튜브)를 분리해 반환.
 * - 자기보고 (selfReport): LiveAttendance distinct (가족 모두 포함)
 *     · userId 가 있으면 userId 단위, 없으면 (sessionId, name) 단위로 distinct
 * - 웹 체류 (webDwell): VisitLog 중 (sessionId or IP+UA) distinct,
 *     · path 가 /live 또는 /live-worship
 *     · createdAt 이 startAt ~ endAt 사이
 *     · dwellSec >= DWELL_MIN_SEC (1분)
 *     · 자기보고 사용자와 dedup (같은 userId 또는 sessionId 가 있으면 제외)
 * - YouTube (youtube): LiveYoutubeServiceStat 의 peak + cumulative 차이로 평균 추정
 */
export async function GET(req: NextRequest) {
  const u = await requireAdminOrCouncil();
  if (!u) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const dateStr = sp.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD 필요" }, { status: 400 });
  }

  const instances = await listInstancesByDate(dateStr);
  if (instances.length === 0) {
    return NextResponse.json({ date: dateStr, services: [] });
  }

  // YouTube 통계 — 그날 전체에 대해 한 번 조회
  const ytRows = await prisma.liveYoutubeServiceStat.findMany({
    where: { serviceDate: new Date(`${dateStr}T00:00:00Z`) },
  });
  const ytMap = new Map(ytRows.map((r) => [r.serviceCode, r]));

  const services = await Promise.all(
    instances.map(async (inst) => {
      // 자기보고 distinct
      const attendances = await prisma.liveAttendance.findMany({
        where: { serviceInstanceId: inst.id },
        select: {
          id: true,
          name: true,
          userId: true,
          sessionId: true,
          ip: true,
        },
      });
      // distinct: userId 우선, 그 외엔 (sessionId or ip, name)
      const selfKeys = new Set<string>();
      for (const a of attendances) {
        if (a.userId) selfKeys.add(`u:${a.userId}`);
        else selfKeys.add(`n:${a.sessionId || a.ip || ""}:${a.name}`);
      }
      const selfReport = selfKeys.size;

      // 자기보고에 포함된 sessionId / userId — 웹 체류 dedup 용
      const selfSessionIds = new Set<string>();
      const selfUserIds = new Set<number>();
      for (const a of attendances) {
        if (a.sessionId) selfSessionIds.add(a.sessionId);
        if (a.userId) selfUserIds.add(a.userId);
      }

      // 웹 체류 — /live, /live-worship 경로 visit_log 중 dwell ≥ 1분 + 시간 일치
      const dwellRows = await prisma.visitLog.findMany({
        where: {
          path: { in: ["/live", "/live-worship"] },
          createdAt: { gte: inst.startAt, lt: inst.endAt },
          dwellSec: { gte: DWELL_MIN_SEC },
        },
        select: {
          userId: true,
          sessionId: true,
          ip: true,
          userAgent: true,
        },
      });
      const dwellKeys = new Set<string>();
      for (const v of dwellRows) {
        if (v.userId && selfUserIds.has(v.userId)) continue;
        if (v.sessionId && selfSessionIds.has(v.sessionId)) continue;
        // 키: userId > sessionId > (ip + ua)
        if (v.userId) dwellKeys.add(`u:${v.userId}`);
        else if (v.sessionId) dwellKeys.add(`s:${v.sessionId}`);
        else dwellKeys.add(`ipa:${v.ip}:${(v.userAgent || "").slice(0, 32)}`);
      }
      const webDwell = dwellKeys.size;

      // YouTube — peak + 평균(=cumulativeEnd - cumulativeStart 가 시간 평균 대용)
      const yt = ytMap.get(inst.code);
      const peak = yt?.peakConcurrent ?? 0;
      const cumDelta = (yt?.cumulativeEnd ?? 0) - (yt?.cumulativeStart ?? 0);
      // 평균은 단순값 (peak + cumDelta) 의 50% 로 근사 — 보수적 추정
      // 더 정교한 평균이 필요하면 시간대별 sampling 도 더 들여다봐야.
      const ytAvg = peak > 0 ? Math.round((peak + Math.max(0, cumDelta)) / 2) : 0;

      const estimate = selfReport + webDwell;

      return {
        id: inst.id,
        code: inst.code,
        label: inst.label,
        startAt: inst.startAt,
        endAt: inst.endAt,
        isRegular: inst.isRegular,
        closedAt: inst.closedAt,
        selfReport: {
          count: selfReport,
          method: "LiveAttendance distinct (가족 포함)",
        },
        webDwell: {
          count: webDwell,
          threshold: "1분 이상 체류",
          dedupWithSelfReport: true,
        },
        youtube: {
          peak,
          avg: ytAvg,
          cumulativeDelta: Math.max(0, cumDelta),
        },
        estimate: {
          value: estimate,
          formula: "selfReport ∪ webDwell (YouTube 별도)",
        },
      };
    }),
  );

  return NextResponse.json({ date: dateStr, services });
}
