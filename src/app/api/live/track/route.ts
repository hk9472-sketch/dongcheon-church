import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { classifyService, loadWindows } from "@/lib/liveService";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const BOT_PATTERNS =
  /bot|crawler|spider|crawling|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegrambot|yandex|baidu|duckduck|archive|wget|curl|python-requests|go-http-client|java\/|httpclient|fetcher|scraper|headless|phantom|selenium|puppeteer|lighthouse|pagespeed/i;

/**
 * POST /api/live/track
 * body: { path: string }
 * - 봇 UA 거름
 * - rate-limit (IP 당 30회/분)
 * - 같은 IP 가 같은 (serviceCode, serviceDate) 에서 이미 기록되면 INSERT 만 추가하되 통계 SELECT 시 DISTINCT 로 dedup
 * - userId 있으면 함께 저장
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`live-track:${ip}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ skipped: true, reason: "rate-limit" }, { status: 429 });
  }

  const userAgent = req.headers.get("user-agent") || "";
  if (BOT_PATTERNS.test(userAgent)) {
    return NextResponse.json({ skipped: true, reason: "bot" });
  }

  const body = await req.json().catch(() => ({}));
  const path = String(body?.path || "/live").slice(0, 50);
  if (!/^\/(live|live-worship)/.test(path)) {
    return NextResponse.json({ skipped: true, reason: "path" });
  }

  const me = await getCurrentUser().catch(() => null);
  const windows = await loadWindows();
  const svc = classifyService(new Date(), windows);
  // KST YMD 문자열 → UTC 자정으로 저장 (DATE 컬럼이라 시각 무의미, KST 일자가 그대로 보존됨)
  const serviceDate = new Date(svc.serviceDate + "T00:00:00.000Z");
  const ipSafe = ip || "unknown";

  // 같은 (ip, serviceCode, serviceDate) 의 최근 5분 내 행이 있으면 timestamp 만 갱신.
  // (heartbeat 30s 간격 → 행 폭증 방지. cumulative DISTINCT ip 카운트 동일 유지.)
  const recent = await prisma.liveServiceVisit.findFirst({
    where: {
      ip: ipSafe,
      serviceCode: svc.code,
      serviceDate,
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
    select: { id: true },
  });

  if (recent) {
    await prisma.liveServiceVisit.update({
      where: { id: recent.id },
      data: { createdAt: new Date() },
    });
  } else {
    await prisma.liveServiceVisit.create({
      data: {
        ip: ipSafe,
        userAgent: userAgent.slice(0, 500) || null,
        userId: me?.id ?? null,
        path,
        serviceCode: svc.code,
        serviceLabel: svc.label,
        serviceDate,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    service: {
      code: svc.code,
      label: svc.label,
      inProgress: svc.inProgress,
    },
  });
}
