import prisma from "@/lib/db";

// ============================================================
// 실시간 예배 — 서비스 시간 분류
// 기본 윈도우는 아래 DEFAULT_WINDOWS. 관리자가 /admin/live-stats 에서 수정하면
// site_settings.live_service_windows (JSON) 에 저장되고, 그 값이 우선 적용됨.
// ============================================================

export type ServiceCode =
  | "dawn"
  | "eve"
  | "sun_child_am"
  | "sun_adult_am"
  | "sun_adult_pm"
  | "sun_child_pm"
  | "other";

export interface ServiceWindow {
  /** 서비스 코드 — 'other' 는 윈도우 정의 X (그 외 시간) */
  code: Exclude<ServiceCode, "other">;
  label: string;
  /** 0=일 ... 6=토 */
  days: number[];
  /** KST 자정 기준 분 단위 */
  startMin: number;
  endMin: number;
}

export interface ServiceInfo {
  code: ServiceCode;
  label: string;
  serviceDate: string;
  inProgress: boolean;
  start?: Date;
  end?: Date;
}

export const DEFAULT_WINDOWS: ServiceWindow[] = [
  { code: "dawn",         label: "새벽기도",    days: [1, 2, 3, 4, 5, 6], startMin: 180,  endMin: 300  },
  { code: "eve",          label: "밤예배",      days: [3, 5],             startMin: 1080, endMin: 1220 },
  { code: "sun_child_am", label: "주교오전",    days: [0],                startMin: 480,  endMin: 540  },
  { code: "sun_adult_am", label: "장년반 오전", days: [0],                startMin: 570,  endMin: 680  },
  { code: "sun_adult_pm", label: "장년반 오후", days: [0],                startMin: 810,  endMin: 920  },
  { code: "sun_child_pm", label: "주교오후",    days: [0],                startMin: 970,  endMin: 1020 },
];

const SETTING_KEY = "live_service_windows";

/** DB에서 윈도우 설정 로드 — 없거나 파싱 실패 시 DEFAULT_WINDOWS */
export async function loadWindows(): Promise<ServiceWindow[]> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row?.value) return DEFAULT_WINDOWS;
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return DEFAULT_WINDOWS;
    // 검증 — 필수 필드 누락 시 폴백
    const valid: ServiceWindow[] = [];
    for (const w of parsed) {
      if (
        typeof w?.code === "string" &&
        typeof w?.label === "string" &&
        Array.isArray(w?.days) &&
        w.days.every((d: unknown) => typeof d === "number" && d >= 0 && d <= 6) &&
        typeof w?.startMin === "number" &&
        typeof w?.endMin === "number" &&
        w.startMin >= 0 && w.startMin < 1440 &&
        w.endMin > w.startMin && w.endMin <= 1440
      ) {
        valid.push(w as ServiceWindow);
      }
    }
    return valid.length > 0 ? valid : DEFAULT_WINDOWS;
  } catch {
    return DEFAULT_WINDOWS;
  }
}

/** 윈도우 설정을 DB에 저장 (관리자 호출 전제) */
export async function saveWindows(windows: ServiceWindow[]): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(windows) },
    update: { value: JSON.stringify(windows) },
  });
}

function toKst(d: Date) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return {
    day: kst.getUTCDay(),
    timeMin: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    ymd: kst.toISOString().slice(0, 10),
    raw: kst,
  };
}

/** windows 인자 기반 분류. DB 동기화 필요 시 호출 측에서 loadWindows() 후 전달. */
export function classifyService(now: Date, windows: ServiceWindow[] = DEFAULT_WINDOWS): ServiceInfo {
  const k = toKst(now);

  for (const w of windows) {
    if (!w.days.includes(k.day)) continue;
    if (k.timeMin < w.startMin || k.timeMin >= w.endMin) continue;
    const start = new Date(k.raw);
    start.setUTCHours(Math.floor(w.startMin / 60), w.startMin % 60, 0, 0);
    start.setTime(start.getTime() - 9 * 3600 * 1000);
    const end = new Date(k.raw);
    end.setUTCHours(Math.floor(w.endMin / 60), w.endMin % 60, 0, 0);
    end.setTime(end.getTime() - 9 * 3600 * 1000);
    return {
      code: w.code,
      label: w.label,
      serviceDate: k.ymd,
      inProgress: true,
      start,
      end,
    };
  }
  return {
    code: "other",
    label: "기타",
    serviceDate: k.ymd,
    inProgress: false,
  };
}

/** 다음으로 가까운 서비스 시작 시각 (UI 카운트다운용) */
export function nextServiceStart(
  now: Date,
  windows: ServiceWindow[] = DEFAULT_WINDOWS,
): { code: ServiceCode; label: string; start: Date } | null {
  const k = toKst(now);
  let best: { code: ServiceCode; label: string; start: Date } | null = null;
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const targetDay = (k.day + dayOffset) % 7;
    for (const w of windows) {
      if (!w.days.includes(targetDay)) continue;
      const startKstMs =
        Date.UTC(
          k.raw.getUTCFullYear(),
          k.raw.getUTCMonth(),
          k.raw.getUTCDate() + dayOffset,
          Math.floor(w.startMin / 60),
          w.startMin % 60,
          0,
        ) - 9 * 3600 * 1000;
      if (startKstMs <= now.getTime()) continue;
      if (!best || startKstMs < best.start.getTime()) {
        best = { code: w.code, label: w.label, start: new Date(startKstMs) };
      }
    }
  }
  return best;
}

export const SERVICE_LABELS: Record<ServiceCode, string> = {
  dawn: "새벽기도",
  eve: "밤예배",
  sun_child_am: "주교오전",
  sun_adult_am: "장년반 오전",
  sun_adult_pm: "장년반 오후",
  sun_child_pm: "주교오후",
  other: "기타",
};

export const SERVICE_CODES: { code: ServiceCode; label: string }[] = [
  { code: "dawn", label: "새벽기도" },
  { code: "eve", label: "밤예배" },
  { code: "sun_child_am", label: "주교오전" },
  { code: "sun_adult_am", label: "장년반 오전" },
  { code: "sun_adult_pm", label: "장년반 오후" },
  { code: "sun_child_pm", label: "주교오후" },
  { code: "other", label: "기타" },
];

/** 분 → "HH:MM" 포맷 */
export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** "HH:MM" → 분. 잘못된 형식이면 null. */
export function hhmmToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export const DAY_LABELS = ["주일", "월", "화", "수", "목", "금", "토"];
