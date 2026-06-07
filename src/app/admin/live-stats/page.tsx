"use client";

import { useEffect, useState, useCallback } from "react";
import TimeSeriesChart from "@/components/live/TimeSeriesChart";

const SERVICE_LABELS: Record<string, string> = {
  dawn: "새벽기도",
  eve: "밤예배",
  sun_child_am: "주교오전",
  sun_adult_am: "장년반 오전",
  sun_adult_pm: "장년반 오후",
  sun_child_pm: "주교오후",
  gap_to_dawn: "→새벽",
  gap_to_eve: "→밤",
  gap_to_sun_child_am: "→주교오전",
  gap_to_sun_adult_am: "→장년오전",
  gap_to_sun_adult_pm: "→장년오후",
  gap_to_sun_child_pm: "→주교오후",
  gap_between: "예배 사이",
  other: "기타",
};

const SERVICE_BASE_CODES = ["dawn", "eve", "sun_child_am", "sun_adult_am", "sun_adult_pm", "sun_child_pm"];
const SERVICE_GAP_CODES = ["gap_to_dawn", "gap_to_eve", "gap_to_sun_child_am", "gap_to_sun_adult_am", "gap_to_sun_adult_pm", "gap_to_sun_child_pm", "gap_between"];

const DAY_LABELS = ["주일", "월", "화", "수", "목", "금", "토"];

interface ServiceWindow {
  code: string;
  label: string;
  days: number[];
  startMin: number;
  endMin: number;
}

function minToHHMM(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}
function hhmmToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

interface YtCell { peak: number; delta: number }
interface RecentDay {
  date: string;
  perService: Record<string, number>;
  total: number;
  youtubePerService?: Record<string, YtCell>;
  youtubeTotalPeak?: number;
  youtubeTotalDelta?: number;
  hourly?: Record<number, number>;
  youtubeHourly?: Record<number, YtCell>;
}

function fmtYt(c?: YtCell): string {
  if (!c || (c.peak === 0 && c.delta === 0)) return "";
  return `${c.peak}/${c.delta}`;
}

const HOURS = Array.from({ length: 19 }, (_, i) => i + 3); // 3, 4, ..., 21

interface LogRow {
  id: number;
  ip: string;
  path: string;
  serviceCode: string;
  serviceLabel: string;
  serviceDate: string;
  createdAt: string;
  userAgent: string | null;
  userId: number | null;
}

export default function LiveStatsPage() {
  const [recent, setRecent] = useState<RecentDay[]>([]);
  const [today, setToday] = useState<RecentDay | null>(null);
  const [current, setCurrent] = useState<{ label: string; inProgress: boolean; currentCount: number } | null>(null);
  const [youtube, setYoutube] = useState<{ enabled: boolean; concurrent: number; cumulative: number }>({ enabled: false, concurrent: 0, cumulative: 0 });
  // 탭 — windows / stats / log
  const [tab, setTab] = useState<"byService" | "windows" | "stats" | "log">("byService");
  // 기간 — 기본은 최근 14일
  const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const fourteenAgoStr = new Date(Date.now() + 9 * 3600 * 1000 - 13 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const [statFrom, setStatFrom] = useState(fourteenAgoStr);
  const [statTo, setStatTo] = useState(todayStr);

  // 로그 조회 상태
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [service, setService] = useState("");
  const [page, setPage] = useState(1);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 윈도우 편집 상태
  const [windows, setWindows] = useState<ServiceWindow[]>([]);
  const [defaults, setDefaults] = useState<ServiceWindow[]>([]);
  const [winSaving, setWinSaving] = useState(false);
  const [winMsg, setWinMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [startStr, setStartStr] = useState<Record<number, string>>({});
  const [endStr, setEndStr] = useState<Record<number, string>>({});

  const loadWindowsCfg = useCallback(() => {
    fetch("/api/admin/live/windows")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.windows)) {
          setWindows(d.windows);
          const ss: Record<number, string> = {};
          const es: Record<number, string> = {};
          d.windows.forEach((w: ServiceWindow, i: number) => {
            ss[i] = minToHHMM(w.startMin);
            es[i] = minToHHMM(w.endMin);
          });
          setStartStr(ss);
          setEndStr(es);
        }
        if (Array.isArray(d.defaults)) setDefaults(d.defaults);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadWindowsCfg();
  }, [loadWindowsCfg]);

  function updateWindow(idx: number, patch: Partial<ServiceWindow>) {
    setWindows((prev) => prev.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  }

  function toggleDay(idx: number, day: number) {
    setWindows((prev) =>
      prev.map((w, i) => {
        if (i !== idx) return w;
        const has = w.days.includes(day);
        const next = has ? w.days.filter((d) => d !== day) : [...w.days, day].sort();
        return { ...w, days: next };
      }),
    );
  }

  async function saveWindowsCfg() {
    setWinSaving(true);
    setWinMsg(null);
    // 시간 문자열 → 분 변환 + 검증
    const cleaned: ServiceWindow[] = [];
    for (let i = 0; i < windows.length; i++) {
      const sMin = hhmmToMin(startStr[i] ?? "");
      const eMin = hhmmToMin(endStr[i] ?? "");
      if (sMin === null || eMin === null) {
        setWinMsg({ type: "err", text: `${windows[i].label} 시간 형식 오류 (HH:MM)` });
        setWinSaving(false);
        return;
      }
      if (eMin <= sMin) {
        setWinMsg({ type: "err", text: `${windows[i].label} 종료가 시작보다 늦어야 함` });
        setWinSaving(false);
        return;
      }
      if (windows[i].days.length === 0) {
        setWinMsg({ type: "err", text: `${windows[i].label} 요일 1개 이상 선택` });
        setWinSaving(false);
        return;
      }
      cleaned.push({ ...windows[i], startMin: sMin, endMin: eMin });
    }
    try {
      const res = await fetch("/api/admin/live/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows: cleaned }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "저장 실패");
      setWinMsg({ type: "ok", text: "저장됨 — 새 분류는 다음 방문부터 즉시 적용" });
      setWindows(d.windows);
    } catch (e) {
      setWinMsg({ type: "err", text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setWinSaving(false);
    }
  }

  function resetToDefaults() {
    if (!confirm("기본값으로 되돌릴까요? (저장 버튼을 눌러야 적용됨)")) return;
    setWindows(defaults);
    const ss: Record<number, string> = {};
    const es: Record<number, string> = {};
    defaults.forEach((w, i) => {
      ss[i] = minToHHMM(w.startMin);
      es[i] = minToHHMM(w.endMin);
    });
    setStartStr(ss);
    setEndStr(es);
    setWinMsg({ type: "ok", text: "폼만 기본값으로 복원됨. 저장 버튼을 눌러 확정하세요" });
  }

  const loadStats = useCallback(() => {
    const params = new URLSearchParams();
    params.set("from", statFrom);
    params.set("to", statTo);
    fetch(`/api/live/stats?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRecent(d.recent || []);
        setToday(d.today);
        setCurrent(d.currentService);
        if (d.youtube) setYoutube(d.youtube);
      });
  }, [statFrom, statTo]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (service) params.set("service", service);
      const res = await fetch(`/api/admin/live/log?${params}`);
      const d = await res.json();
      if (res.ok) {
        setLogRows(d.rows || []);
        setLogTotal(d.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [from, to, service, page]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const totalPages = Math.max(1, Math.ceil(logTotal / 100));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">실시간 예배 통계</h1>
        <p className="text-sm text-gray-500 mt-1">/live, /live-worship 페이지 자동 방문 카운트 — 서비스 시간별 분류.</p>
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-blue-700 hover:underline">집계 방식 / 기타 / 유튜브 폴링 안내</summary>
          <ul className="mt-2 list-disc list-inside space-y-0.5 text-gray-600 leading-relaxed">
            <li><strong>기타</strong> = 예배 시간(서비스 윈도우) 외에 페이지에 접속한 트래픽. 정상 운영 분이지만 어느 서비스에도 속하지 않음.</li>
            <li><strong>유튜브</strong> = YouTube Data API 의 동시 시청자. <strong className="text-amber-700">서비스 윈도우 안에서만 5초 폴링</strong>, 그 외엔 0 또는 캐시. <em className="text-red-600">표시 안 되면 사이트 설정 → "실시간 예배" 에서 API 키 등록 필요.</em></li>
            <li><strong>현재</strong> 30초 = 페이지에 활성 (heartbeat 30s) 인 IP. <strong>총시청</strong> = 웹 unique IP/일 + YouTube 누적. KST 자정 리셋.</li>
            <li>일자는 <strong>KST 기준</strong> 으로 분류. 이전 버전에서 UTC 로 잘못 분류된 데이터가 있을 수 있음 (수정 후엔 정상).</li>
          </ul>
        </details>
      </div>

      {/* 현재 진행 (모든 탭 공통) */}
      {current && (
        <div className={`rounded-lg p-4 border-2 ${current.inProgress ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">현재 상태</p>
              <p className="text-lg font-bold text-gray-800">
                {current.inProgress ? `${current.label} 진행 중` : "예배 시간 외"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{current.inProgress ? "현재까지 누적" : "최근 30초 접속"}</p>
              <p className="text-3xl font-bold text-emerald-700 leading-none">{current.currentCount}<span className="text-base ml-1">명</span></p>
              {youtube.enabled && (
                <p className="text-sm font-semibold text-red-600 mt-1">
                  유튜브: <span className="font-mono">{youtube.concurrent}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-gray-200">
        {[
          { key: "byService", label: "예배별 (신뢰도 분리)", icon: "🎯" },
          { key: "windows", label: "서비스 시간 설정", icon: "⏰" },
          { key: "stats", label: "기간 일자별 통계", icon: "📊" },
          { key: "log", label: "방문 로그", icon: "📋" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key as "windows" | "stats" | "log" | "byService")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700 bg-blue-50/50"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* === 탭 2: 기간 일자별 통계 === */}
      {tab === "byService" && <ByServiceTab />}

      {tab === "stats" && (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-gray-700">일자별 통계</h2>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={statFrom}
              onChange={(e) => setStatFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={statTo}
              onChange={(e) => setStatTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
            <button
              type="button"
              onClick={() => {
                const t = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
                const f = new Date(Date.now() + 9 * 3600 * 1000 - 13 * 24 * 3600 * 1000).toISOString().slice(0, 10);
                setStatFrom(f);
                setStatTo(t);
              }}
              className="px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
            >
              최근 14일
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium sticky left-0 bg-gray-50 z-10">일자</th>
                {SERVICE_BASE_CODES.map((k) => (
                  <th key={k} className="px-2 py-2 text-right font-medium">{SERVICE_LABELS[k]}</th>
                ))}
                <th className="px-2 py-2 text-right font-bold text-blue-700">합계</th>
                {HOURS.map((h) => (
                  <th key={h} className="px-1.5 py-2 text-right font-medium text-[10px] text-gray-500" title={`${h}시 ~ ${h + 1}시`}>
                    {String(h).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.flatMap((d) => [
                // 1행: 자체 사이트 (웹) — 일자 셀 rowSpan 2
                <tr key={`${d.date}-web`} className="hover:bg-gray-50">
                  <td rowSpan={2} className="px-3 py-1.5 font-mono text-gray-700 sticky left-0 bg-white z-10 border-b border-gray-200">
                    {d.date}
                    <div className="text-[9px] text-gray-400 font-normal mt-0.5">웹 / 유튜브</div>
                  </td>
                  {SERVICE_BASE_CODES.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right text-gray-700 font-mono">
                      {d.perService[k] || ""}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold text-blue-700 font-mono">{d.total || ""}</td>
                  {HOURS.map((h) => (
                    <td key={h} className="px-1.5 py-1.5 text-right text-gray-600 font-mono text-[11px]">
                      {d.hourly?.[h] || ""}
                    </td>
                  ))}
                </tr>,
                // 2행: 유튜브
                <tr key={`${d.date}-yt`} className="border-b border-gray-200 hover:bg-red-50/30">
                  {SERVICE_BASE_CODES.map((k) => (
                    <td key={k} className="px-2 py-1 text-right text-red-600 font-mono text-[11px]" title="동시최대 / 누적합류">
                      {fmtYt(d.youtubePerService?.[k])}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-semibold text-red-600 font-mono text-[11px]" title="일 동시최대 / 누적합류">
                    {(d.youtubeTotalPeak || d.youtubeTotalDelta) ? `${d.youtubeTotalPeak || 0}/${d.youtubeTotalDelta || 0}` : ""}
                  </td>
                  {HOURS.map((h) => (
                    <td key={h} className="px-1.5 py-1 text-right text-red-500 font-mono text-[10px]" title="동시최대 / 누적합류">
                      {fmtYt(d.youtubeHourly?.[h])}
                    </td>
                  ))}
                </tr>,
              ])}
              {recent.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      )}

      {/* === 탭 1: 서비스 시간 윈도우 편집 === */}
      {tab === "windows" && (
      <div className="bg-white rounded-lg shadow-sm border-2 border-amber-200 overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-amber-800">서비스 시간 설정</h2>
            <p className="text-[11px] text-amber-700 mt-0.5">
              여기서 변경하면 분류·집계가 새 윈도우로 동작합니다 (과거 데이터는 그대로).
            </p>
          </div>
          <button
            type="button"
            onClick={resetToDefaults}
            className="px-3 py-1 text-xs border border-amber-300 text-amber-700 rounded hover:bg-amber-100"
          >
            기본값 복원
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-20">코드</th>
                <th className="px-3 py-2 text-left font-medium w-32">라벨</th>
                <th className="px-3 py-2 text-left font-medium">요일</th>
                <th className="px-3 py-2 text-left font-medium w-24">시작</th>
                <th className="px-3 py-2 text-left font-medium w-24">종료</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w, idx) => (
                <tr key={w.code} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-500">{w.code}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={w.label}
                      onChange={(e) => updateWindow(idx, { label: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {DAY_LABELS.map((lbl, d) => {
                        const on = w.days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDay(idx, d)}
                            className={`px-2 h-7 text-xs rounded border ${
                              on
                                ? d === 0
                                  ? "bg-red-500 text-white border-red-500"
                                  : d === 6
                                  ? "bg-blue-500 text-white border-blue-500"
                                  : "bg-emerald-500 text-white border-emerald-500"
                                : "bg-white text-gray-400 border-gray-300 hover:border-gray-500"
                            }`}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      placeholder="03:00"
                      value={startStr[idx] ?? ""}
                      onChange={(e) => setStartStr((p) => ({ ...p, [idx]: e.target.value }))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      placeholder="05:00"
                      value={endStr[idx] ?? ""}
                      onChange={(e) => setEndStr((p) => ({ ...p, [idx]: e.target.value }))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-3">
          <button
            type="button"
            onClick={saveWindowsCfg}
            disabled={winSaving}
            className="px-4 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
          >
            {winSaving ? "저장 중..." : "저장"}
          </button>
          {winMsg && (
            <span className={`text-xs ${winMsg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
              {winMsg.text}
            </span>
          )}
        </div>
      </div>

      )}

      {/* === 탭 3: 기간 방문 로그 === */}
      {tab === "log" && (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-700">기간 방문 로그</h2>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">시작일</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">종료일</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">서비스</label>
            <select value={service} onChange={(e) => { setService(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1 text-sm">
              <option value="">전체</option>
              {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            총 <strong className="text-blue-700">{logTotal}</strong>건
          </div>
        </div>
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">시각</th>
                <th className="px-3 py-2 text-left font-medium">서비스</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
                <th className="px-3 py-2 text-left font-medium">path</th>
                <th className="px-3 py-2 text-left font-medium">UA</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>}
              {!loading && logRows.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-gray-400">데이터 없음</td></tr>}
              {logRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-700">
                    {new Date(r.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700">{r.serviceLabel}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{r.ip}</td>
                  <td className="px-3 py-1.5 text-gray-500">{r.path}</td>
                  <td className="px-3 py-1.5 text-gray-400 truncate max-w-[300px]" title={r.userAgent || ""}>{r.userAgent?.slice(0, 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-gray-200 flex items-center gap-2 text-xs">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-30">이전</button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-30">다음</button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ============================================================
// [예배별] 탭 — 단위 예배(ServiceInstance) 카드 + 3출처 분리 통계
// ============================================================

interface ServiceStat {
  id: number;
  code: string;
  label: string;
  startAt: string;
  endAt: string;
  isRegular: boolean;
  closedAt: string | null;
  selfReport: { count: number; method: string };
  webEntry?: { count: number; method: string; dedupWithSelfReport: boolean };
  embedPlay?: { count: number; method: string; dedupWithSelfReport: boolean };
  webDwell: { count: number; threshold: string; dedupWithSelfReport: boolean };
  youtube: { peak: number; avg: number; cumulativeDelta: number };
  estimate: { value: number; formula: string };
}

function todayKstStr(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function ByServiceTab() {
  const [date, setDate] = useState<string>(todayKstStr());
  const [services, setServices] = useState<ServiceStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 시계열 펼침 — 여러 카드 동시에 열어둘 수 있게 Set
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const toggleOpen = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/live/service-stats?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setServices(data.services || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">날짜</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          새로고침
        </button>
        <p className="ml-auto text-[11px] text-gray-500 max-w-md leading-snug">
          한 예배(ServiceInstance) 당 1장의 카드. 자기보고·웹체류·유튜브를 분리해 표시.
          YouTube 수치는 보조 지표(★) 라 자기보고+웹체류와 별도로 봅니다.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-400">불러오는 중...</div>}

      {!loading && services.length === 0 && (
        <div className="text-sm text-gray-400 py-8 text-center bg-white border border-dashed border-gray-200 rounded-lg">
          이 날짜에 등록된 예배가 없습니다.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {services.map((s) => (
          <div
            key={s.id}
            className="bg-white border border-gray-200 rounded-lg overflow-hidden"
          >
            <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800">
                  {s.label}
                  {!s.isRegular && (
                    <span className="ml-2 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      임시
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-gray-500 font-mono">
                  {fmtTime(s.startAt)} – {fmtTime(s.endAt)}
                </p>
              </div>
              {s.closedAt && (
                <span className="text-[10px] text-gray-600 bg-gray-200 px-2 py-0.5 rounded">
                  🔒 확정됨
                </span>
              )}
            </div>
            <div className="p-3 space-y-2 text-sm">
              <Row
                color="emerald"
                stars="★★★"
                label="자기보고"
                value={s.selfReport.count}
                sub={s.selfReport.method}
              />
              <Row
                color="blue"
                stars="★★"
                label="웹 체류"
                value={s.webDwell.count}
                sub={`${s.webDwell.threshold} · 자기보고와 중복 제거`}
              />
              {s.webEntry && (
                <Row
                  color="slate"
                  stars="★ 참고"
                  label="웹 진입"
                  value={s.webEntry.count}
                  sub="체류 시간 무관 · 진입만 카운트 (사후 산출용)"
                />
              )}
              {s.embedPlay && (
                <Row
                  color="violet"
                  stars="★★ 참고"
                  label="임베드 재생"
                  value={s.embedPlay.count}
                  sub="우리 사이트 임베드 PLAYING · sessionId dedup"
                />
              )}
              <Row
                color="amber"
                stars="★ 보조"
                label="YouTube"
                value={s.youtube.peak}
                sub={`최대 동시 / 평균 ${s.youtube.avg} (외부 포함, 단순 합산 금지)`}
              />
              <div className="border-t border-gray-200 pt-2 flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] text-gray-500">추정 참석 (자기보고 ∪ 웹 체류)</p>
                </div>
                <p className="text-2xl font-bold text-indigo-700 font-mono">
                  {s.estimate.value}
                  <span className="text-sm text-gray-400 ml-1">명</span>
                </p>
              </div>
              {/* 시계열 차트 토글 — 여러 카드 동시 펼침 가능 */}
              <button
                type="button"
                onClick={() => toggleOpen(s.id)}
                className="w-full mt-2 py-1 text-[11px] border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
              >
                {openIds.has(s.id) ? "▲ 시계열 차트 닫기" : "▼ 시계열 차트 보기"}
              </button>
              {openIds.has(s.id) && (
                <div className="mt-2">
                  <TimeSeriesChart serviceInstanceId={s.id} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({
  color,
  stars,
  label,
  value,
  sub,
}: {
  color: "emerald" | "blue" | "amber" | "slate" | "violet";
  stars: string;
  label: string;
  value: number;
  sub: string;
}) {
  const colorMap = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    slate: { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-400" },
    violet: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  }[color];
  return (
    <div className={`flex items-baseline justify-between gap-2 ${colorMap.bg} px-2 py-1.5 rounded`}>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={`inline-block w-2 h-2 rounded-full ${colorMap.dot}`} />
        <span className={`font-semibold ${colorMap.text}`}>{label}</span>
        <span className="text-[10px] text-gray-500">{stars}</span>
        <span className="text-[10px] text-gray-400 truncate">{sub}</span>
      </div>
      <span className="text-lg font-bold font-mono text-gray-800">{value}</span>
    </div>
  );
}
