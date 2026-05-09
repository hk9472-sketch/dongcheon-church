"use client";

import { useEffect, useState, useCallback } from "react";

const SERVICE_LABELS: Record<string, string> = {
  dawn: "새벽기도",
  eve: "밤예배",
  sun_child_am: "주교오전",
  sun_adult_am: "장년반 오전",
  sun_adult_pm: "장년반 오후",
  sun_child_pm: "주교오후",
  other: "기타",
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

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

interface RecentDay {
  date: string;
  perService: Record<string, number>;
  total: number;
}

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
  const [days, setDays] = useState(14);

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
    fetch(`/api/live/stats?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setRecent(d.recent || []);
        setToday(d.today);
        setCurrent(d.currentService);
      });
  }, [days]);

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
      </div>

      {/* 현재 진행 */}
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
              <p className="text-xs text-gray-500">{current.inProgress ? "현재까지 누적" : "최근 5분 접속"}</p>
              <p className="text-3xl font-bold text-emerald-700">{current.currentCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* 일자×서비스 매트릭스 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">최근 일자별 통계</h2>
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))} className="text-xs border border-gray-300 rounded px-2 py-1">
            <option value={7}>최근 7일</option>
            <option value={14}>최근 14일</option>
            <option value={30}>최근 30일</option>
            <option value={60}>최근 60일</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">일자</th>
                {Object.keys(SERVICE_LABELS).filter((k) => k !== "other").map((k) => (
                  <th key={k} className="px-3 py-2 text-right font-medium">{SERVICE_LABELS[k]}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">기타</th>
                <th className="px-3 py-2 text-right font-bold text-blue-700">합계</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.date} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-700">{d.date}</td>
                  {Object.keys(SERVICE_LABELS).filter((k) => k !== "other").map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right text-gray-600 font-mono">
                      {d.perService[k] || ""}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right text-gray-400 font-mono">{d.perService.other || ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold text-blue-700 font-mono">{d.total || ""}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 서비스 시간 윈도우 편집 */}
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
                            className={`w-7 h-7 text-xs rounded border ${
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

      {/* 기간 로그 조회 */}
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
                  <td className="px-3 py-1.5 font-mono text-gray-700">{r.createdAt.replace("T", " ").slice(0, 19)}</td>
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
    </div>
  );
}
