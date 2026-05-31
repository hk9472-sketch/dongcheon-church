import prisma from "@/lib/db";
import {
  DEFAULT_WINDOWS,
  loadWindows,
  type ServiceWindow,
} from "@/lib/liveService";

/**
 * "단위 예배 1회" 모델 — 통계 집계의 자연 키.
 *
 * 기존 SiteSetting.live_service_windows 의 정기 윈도우 + 임시(부흥회 등) 를 모두
 * ServiceInstance row 로 통일해서 식별.
 *
 * 핵심 함수:
 *   ensureServiceInstancesForDate(date)
 *     — 그 날짜의 정기 예배 row 들을 lazy upsert.
 *   findCurrentInstance(now, graceMin)
 *     — 지금 진행 중 / 직전 끝난 예배 1개 반환 (LiveAttendanceForm 노출 판단).
 *   listInstancesByDate(date)
 *     — 통계 페이지용. 그날의 정기 + 임시 모두 반환.
 */

/** KST 기준 yyyy-mm-dd / 요일(0=일~6=토) 추출 */
function toKstParts(d: Date) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return {
    day: kst.getUTCDay(),
    ymd: kst.toISOString().slice(0, 10),
    raw: kst,
  };
}

/** ymd ("YYYY-MM-DD") + 분 → UTC Date (KST 분을 UTC 로 환산) */
function ymdMinToUtc(ymd: string, min: number): Date {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  // KST 자정 = UTC 의 전날 15:00. (y,m-1,d, 0,0) UTC 는 KST 09:00 — 차이 -9h
  const utcMs =
    Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60, 0) - 9 * 3600 * 1000;
  return new Date(utcMs);
}

/** ymd ("YYYY-MM-DD") → @db.Date 용 UTC 자정 Date */
function ymdToDateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/**
 * 주어진 날짜의 정기 예배 ServiceInstance 들을 lazy upsert.
 * - 이미 있는 (code, serviceDate) 는 건드리지 않음 (closedAt 보호)
 * - 임시 예배(isRegular=false) 는 별개 — 여기서 다루지 않음
 *
 * 호출 시점: 통계 페이지 조회 시, current-service 호출 시, 매일 자정 cron(선택).
 */
export async function ensureServiceInstancesForDate(date: string | Date): Promise<void> {
  const ymd =
    typeof date === "string"
      ? date
      : toKstParts(date).ymd;
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  // 해당 요일 (UTC 가 아니라 KST 의 요일을 봐야 함)
  const kstNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // 자정 ±은 안전한 정오
  const dow = toKstParts(kstNoon).day;

  const windows = await loadWindows().catch(() => DEFAULT_WINDOWS);
  const todays = windows.filter((w) => w.days.includes(dow));
  if (todays.length === 0) return;

  const dateOnly = ymdToDateOnly(ymd);

  // 한 번에 multi-upsert — Prisma 가 createMany skipDuplicates 지원
  // 이미 있는 (code, serviceDate) 는 skip 되어 기존 row 보호.
  await prisma.serviceInstance.createMany({
    data: todays.map((w) => ({
      code: w.code,
      label: w.label,
      serviceDate: dateOnly,
      startAt: ymdMinToUtc(ymd, w.startMin),
      endAt: ymdMinToUtc(ymd, w.endMin),
      isRegular: true,
    })),
    skipDuplicates: true,
  });
}

/**
 * 지금 진행 중인 ServiceInstance + 직전 끝난 예배(grace 내) 반환.
 * LiveAttendanceForm 노출 판단에 사용.
 *
 * @param graceMin 예배 종료 후 N분간 등록 허용 (기본 30)
 */
export async function findCurrentInstance(
  now: Date = new Date(),
  graceMin = 30,
): Promise<
  | {
      instance: {
        id: number;
        code: string;
        label: string;
        startAt: Date;
        endAt: Date;
      };
      phase: "in_progress" | "grace";
    }
  | null
> {
  const ymd = toKstParts(now).ymd;
  await ensureServiceInstancesForDate(ymd);

  const dateOnly = ymdToDateOnly(ymd);
  const rows = await prisma.serviceInstance.findMany({
    where: { serviceDate: dateOnly },
    orderBy: { startAt: "asc" },
    select: { id: true, code: true, label: true, startAt: true, endAt: true },
  });

  const nowMs = now.getTime();
  // 진행 중 우선
  for (const r of rows) {
    if (r.startAt.getTime() <= nowMs && nowMs < r.endAt.getTime()) {
      return { instance: r, phase: "in_progress" };
    }
  }
  // grace — 가장 최근에 끝난 예배가 graceMin 내인지
  const ended = rows
    .filter((r) => r.endAt.getTime() <= nowMs)
    .sort((a, b) => b.endAt.getTime() - a.endAt.getTime());
  if (ended[0]) {
    const diffMin = (nowMs - ended[0].endAt.getTime()) / 60000;
    if (diffMin <= graceMin) {
      return { instance: ended[0], phase: "grace" };
    }
  }
  return null;
}

/**
 * 통계 페이지용 — 그날의 정기·임시 ServiceInstance 모두 반환 (startAt asc).
 */
export async function listInstancesByDate(date: string): Promise<
  Array<{
    id: number;
    code: string;
    label: string;
    startAt: Date;
    endAt: Date;
    isRegular: boolean;
    closedAt: Date | null;
  }>
> {
  await ensureServiceInstancesForDate(date);
  const dateOnly = ymdToDateOnly(date);
  return prisma.serviceInstance.findMany({
    where: { serviceDate: dateOnly },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      code: true,
      label: true,
      startAt: true,
      endAt: true,
      isRegular: true,
      closedAt: true,
    },
  });
}

export type ServiceInstanceInfo = Awaited<ReturnType<typeof listInstancesByDate>>[number];

/** 외부 노출 — 단순 합산 임계치 (1분) */
export const DWELL_MIN_SEC = 60;

/** ServiceWindow → 임시 인스턴스 메타 (UI 표시용) */
export function windowToMeta(w: ServiceWindow, ymd: string) {
  return {
    code: w.code,
    label: w.label,
    startAt: ymdMinToUtc(ymd, w.startMin),
    endAt: ymdMinToUtc(ymd, w.endMin),
  };
}
