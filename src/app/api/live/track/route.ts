import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { classifyService } from "@/lib/liveService";
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
  const svc = classifyService(new Date());

  await prisma.liveServiceVisit.create({
    data: {
      ip: ip || "unknown",
      userAgent: userAgent.slice(0, 500) || null,
      userId: me?.id ?? null,
      path,
      serviceCode: svc.code,
      serviceLabel: svc.label,
      serviceDate: new Date(svc.serviceDate + "T00:00:00+09:00"),
    },
  });

  return NextResponse.json({
    ok: true,
    service: {
      code: svc.code,
      label: svc.label,
      inProgress: svc.inProgress,
    },
  });
}
