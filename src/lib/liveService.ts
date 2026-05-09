// ============================================================
// 실시간 예배 — 서비스 시간 분류
// KST 요일·시간을 기준으로 어떤 서비스(예배)인지 판정.
// 새벽기도   월~토   03:00 ~ 05:00
// 밤예배     수,금   18:00 ~ 20:20
// 주교오전   일      08:00 ~ 09:00
// 장년반오전 일      09:30 ~ 11:20
// 장년반오후 일      13:30 ~ 15:20
// 주교오후   일      16:10 ~ 17:00
// 그 외 시간은 'other' (분류 X, 일자별 통계엔 포함)
// ============================================================

export type ServiceCode =
  | "dawn"
  | "eve"
  | "sun_child_am"
  | "sun_adult_am"
  | "sun_adult_pm"
  | "sun_child_pm"
  | "other";

export interface ServiceInfo {
  code: ServiceCode;
  label: string;
  /** KST YYYY-MM-DD — DB serviceDate 컬럼 저장용 */
  serviceDate: string;
  /** 진행 중이면 true (other 면 false) */
  inProgress: boolean;
  /** 진행 중일 때 시작/종료 timestamp (KST). 그 외 null. */
  start?: Date;
  end?: Date;
}

interface Window {
  code: Exclude<ServiceCode, "other">;
  label: string;
  /** 0=일, 1=월 ... 6=토 — 어느 요일에 적용 */
  days: number[];
  /** KST 분 단위 (예: 03:00 = 180) */
  startMin: number;
  endMin: number;
}

const WINDOWS: Window[] = [
  { code: "dawn",         label: "새벽기도",   days: [1, 2, 3, 4, 5, 6], startMin: 180,  endMin: 300  },
  { code: "eve",          label: "밤예배",     days: [3, 5],             startMin: 1080, endMin: 1220 },
  { code: "sun_child_am", label: "주교오전",   days: [0],                startMin: 480,  endMin: 540  },
  { code: "sun_adult_am", label: "장년반 오전", days: [0],                startMin: 570,  endMin: 680  },
  { code: "sun_adult_pm", label: "장년반 오후", days: [0],                startMin: 810,  endMin: 920  },
  { code: "sun_child_pm", label: "주교오후",   days: [0],                startMin: 970,  endMin: 1020 },
];

const SERVICE_LABELS: Record<ServiceCode, string> = {
  dawn: "새벽기도",
  eve: "밤예배",
  sun_child_am: "주교오전",
  sun_adult_am: "장년반 오전",
  sun_adult_pm: "장년반 오후",
  sun_child_pm: "주교오후",
  other: "기타",
};

export function getServiceLabel(code: ServiceCode): string {
  return SERVICE_LABELS[code] ?? "기타";
}

/** KST 시각 정보 추출 — Date 의 UTC 메서드 + 9h 보정으로 KST 일자/요일/시간 반환. */
function toKst(d: Date) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return {
    day: kst.getUTCDay(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    timeMin: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    ymd: kst.toISOString().slice(0, 10),
    raw: kst,
  };
}

/** 주어진 시각(now)이 어느 서비스 윈도우에 속하는지 분류. */
export function classifyService(now: Date = new Date()): ServiceInfo {
  const k = toKst(now);

  for (const w of WINDOWS) {
    if (!w.days.includes(k.day)) continue;
    if (k.timeMin < w.startMin || k.timeMin >= w.endMin) continue;
    // 매치 — 시작/종료 시각 KST timestamp 계산
    const start = new Date(k.raw);
    start.setUTCHours(Math.floor(w.startMin / 60), w.startMin % 60, 0, 0);
    start.setTime(start.getTime() - 9 * 3600 * 1000); // KST → UTC 보정
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

/** 다음으로 가까운 서비스 시작 시각을 반환 (UI "다음 예배까지 남은 시간" 표시용). */
export function nextServiceStart(now: Date = new Date()): { code: ServiceCode; label: string; start: Date } | null {
  // 앞으로 7일 (168시간) 안에 가장 가까운 시작 시각 찾음
  const k = toKst(now);
  let best: { code: ServiceCode; label: string; start: Date } | null = null;
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const targetDay = (k.day + dayOffset) % 7;
    for (const w of WINDOWS) {
      if (!w.days.includes(targetDay)) continue;
      const dayDelta = dayOffset;
      const startKstMs =
        Date.UTC(
          k.raw.getUTCFullYear(),
          k.raw.getUTCMonth(),
          k.raw.getUTCDate() + dayDelta,
          Math.floor(w.startMin / 60),
          w.startMin % 60,
          0,
        ) - 9 * 3600 * 1000;
      if (startKstMs <= now.getTime()) continue; // 이미 지난 시각
      if (!best || startKstMs < best.start.getTime()) {
        best = { code: w.code, label: w.label, start: new Date(startKstMs) };
      }
    }
  }
  return best;
}

/** 모든 서비스 코드 + 라벨 (UI 드롭다운 등에서 사용) */
export const SERVICE_CODES: { code: ServiceCode; label: string }[] = [
  { code: "dawn", label: "새벽기도" },
  { code: "eve", label: "밤예배" },
  { code: "sun_child_am", label: "주교오전" },
  { code: "sun_adult_am", label: "장년반 오전" },
  { code: "sun_adult_pm", label: "장년반 오후" },
  { code: "sun_child_pm", label: "주교오후" },
  { code: "other", label: "기타" },
];
