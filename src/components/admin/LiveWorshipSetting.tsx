"use client";

import { useEffect, useState } from "react";

const QUOTA_PER_DAY = 50_000; // 현재 부여된 일일 quota (2027-01 만료, 재신청 필요)

interface WindowStats {
  weeklySeconds: number;
  peakDaySeconds: number;
  peakDayLabel: string;
}

/** 직접 영상 링크면 search.list 불필요, 채널/@handle 이면 자동탐색(search.list 100units/10분) 사용 */
function isChannelUrl(url: string): boolean {
  const direct = /(?:[?&]v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)[\w-]{11}/.test(url);
  return !direct && /youtube\.com|youtu\.be/.test(url);
}

/** 간격(초) → 예상 quota 소비. 피크일=예배 가장 많은 요일(보통 주일) 기준 + 주간 합. */
function estimateQuota(sec: number, ws: WindowStats, channel: boolean) {
  const s = Math.max(1, sec);
  const videoPeak = Math.ceil(ws.peakDaySeconds / s); // videos.list 1 unit/호출
  const videoWeek = Math.ceil(ws.weeklySeconds / s);
  const searchPeak = channel ? Math.ceil(ws.peakDaySeconds / 600) * 100 : 0; // 10분(600s)마다 100units
  const searchWeek = channel ? Math.ceil(ws.weeklySeconds / 600) * 100 : 0;
  const peakUnits = videoPeak + searchPeak;
  const weekUnits = videoWeek + searchWeek;
  return { videoPeak, peakUnits, weekUnits, pct: (peakUnits / QUOTA_PER_DAY) * 100 };
}

const fmtHm = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

/**
 * 내계집회(실시간 예배) 설정 — /admin/settings 의 "기타" 탭에 임베드.
 * 헤더 버튼 표시 여부 + 송출 URL + YouTube API 키 (시청자 수 조회용) + 폴링 간격/quota.
 */
export default function LiveWorshipSetting() {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState(""); // 입력값 (저장 시에만 서버로 전송)
  const [apiKeySet, setApiKeySet] = useState(false); // 서버에 키가 저장돼 있는지
  const [initial, setInitial] = useState({ enabled: false, url: "" });
  // 폴링 간격 + quota 계산용
  const [pollSec, setPollSec] = useState(10);
  const [initialPoll, setInitialPoll] = useState(10);
  const [pollLimits, setPollLimits] = useState({ min: 3, max: 300, default: 10 });
  const [windowStats, setWindowStats] = useState<WindowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/live-worship")
      .then((r) => r.json())
      .then((d) => {
        const en = !!d?.enabled;
        const u = d?.url || "";
        setEnabled(en);
        setUrl(u);
        setApiKeySet(!!d?.youtubeApiKeySet);
        setInitial({ enabled: en, url: u });
        if (typeof d?.pollIntervalSec === "number") {
          setPollSec(d.pollIntervalSec);
          setInitialPoll(d.pollIntervalSec);
        }
        if (d?.pollLimits) setPollLimits(d.pollLimits);
        if (d?.windowStats) setWindowStats(d.windowStats);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        enabled,
        url: url.trim(),
        pollIntervalSec: pollSec,
      };
      // 입력했을 때만 서버에 키 전송
      if (apiKey !== "") body.youtubeApiKey = apiKey.trim();
      const res = await fetch("/api/settings/live-worship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error || "저장 실패" });
      } else {
        const en = !!data.enabled;
        const u = data.url || "";
        setEnabled(en);
        setUrl(u);
        setApiKeySet(!!data.youtubeApiKeySet);
        setInitial({ enabled: en, url: u });
        if (typeof data.pollIntervalSec === "number") {
          setPollSec(data.pollIntervalSec);
          setInitialPoll(data.pollIntervalSec);
        }
        setApiKey(""); // 저장 후 입력 필드 비움 (보안)
        setMsg({ type: "ok", text: "저장되었습니다." });
        setTimeout(() => setMsg(null), 3000);
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  }

  async function clearApiKey() {
    if (!confirm("YouTube API 키를 삭제할까요? 시청자 수 조회가 비활성됩니다.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/live-worship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeApiKey: "" }),
      });
      if (res.ok) {
        setApiKeySet(false);
        setApiKey("");
        setMsg({ type: "ok", text: "API 키 삭제됨" });
      }
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    enabled !== initial.enabled ||
    url.trim() !== initial.url ||
    apiKey !== "" ||
    pollSec !== initialPoll;

  const channel = isChannelUrl(url);
  const curEst = windowStats ? estimateQuota(initialPoll, windowStats, channel) : null;
  const newEst = windowStats ? estimateQuota(pollSec, windowStats, channel) : null;

  return (
    <div className="bg-white rounded-lg border-2 border-red-200 p-5 space-y-3">
      <div>
        <p className="text-xs text-gray-500">
          헤더의 빨간 <strong className="text-red-600">[내계집회]</strong> 버튼 표시 여부 + 송출 URL +
          YouTube 동시 시청자 조회용 API 키 설정. URL 은 자주 바뀌므로 매번 갱신.
        </p>
      </div>

      <label className="flex items-center gap-2 select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={loading}
          className="w-4 h-4 accent-red-600"
        />
        <span className="text-sm text-gray-700">
          헤더에 <strong className="text-red-600">[내계집회]</strong> 버튼 표시
        </span>
      </label>

      <div>
        <label className="block text-xs text-gray-500 mb-1">유튜브 URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX"
          disabled={loading}
          className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-100"
        />
      </div>

      <div className="border-t pt-3">
        <label className="block text-xs text-gray-500 mb-1">
          YouTube Data API v3 키 {apiKeySet && <span className="text-emerald-700">(현재 저장됨 ✓)</span>}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeySet ? "변경하려면 새 키 입력 (비우면 유지)" : "AIza..."}
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-100"
          />
          {apiKeySet && (
            <button
              type="button"
              onClick={clearApiKey}
              disabled={saving}
              className="px-3 py-2 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
            >
              삭제
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
          Google Cloud Console → API & Services → Credentials → API key. <br />
          YouTube Data API v3 활성화 필요. 현재 부여 quota 일 {QUOTA_PER_DAY.toLocaleString()} units
          (videos.list = 1 unit/호출). <br />
          <strong>예배 시간(서비스 윈도우)에만 폴링</strong> — 윈도우 밖에선 호출 X. 폴링 간격·예상 소비량은 아래에서 설정.
        </p>
      </div>

      {/* 폴링 간격 + quota 예상 소비 */}
      <div className="border-t pt-3">
        <label className="block text-xs text-gray-500 mb-1">
          YouTube 시청자수 폴링 간격 (초) — 화면 갱신 + API 호출 주기
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={pollLimits.min}
            max={pollLimits.max}
            value={pollSec}
            onChange={(e) =>
              setPollSec(
                Math.max(
                  pollLimits.min,
                  Math.min(pollLimits.max, parseInt(e.target.value, 10) || pollLimits.default),
                ),
              )
            }
            disabled={loading}
            className="w-24 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-100"
          />
          <span className="text-xs text-gray-500">
            {pollLimits.min}~{pollLimits.max}초 · 기본 {pollLimits.default}초
          </span>
          <span className="flex gap-1">
            {[5, 10, 15, 30].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPollSec(v)}
                className={`px-2 py-1 text-[11px] rounded border ${
                  pollSec === v
                    ? "bg-red-600 text-white border-red-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {v}초
              </button>
            ))}
          </span>
        </div>

        {windowStats && curEst && newEst && (
          <div className="mt-3 text-xs">
            <p className="text-gray-500 mb-1.5 leading-relaxed">
              예배 시간대에만 폴링(윈도우 밖 0). 피크일(<strong>{windowStats.peakDayLabel}</strong>) 예배{" "}
              {fmtHm(windowStats.peakDaySeconds)} · 주간 총 {fmtHm(windowStats.weeklySeconds)} 기준
              {channel ? " · 채널 자동탐색(search.list) 포함" : " · 직접영상 링크(search 불필요)"}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 rounded">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-2 py-1.5 font-medium">항목</th>
                    <th className="text-right px-2 py-1.5 font-medium">기존 {initialPoll}초</th>
                    <th className="text-right px-2 py-1.5 font-medium text-red-700">변경 {pollSec}초</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-2 py-1.5 text-gray-600">화면 갱신 주기</td>
                    <td className="px-2 py-1.5 text-right">{initialPoll}초마다</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{pollSec}초마다</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 text-gray-600">피크일 API 호출수</td>
                    <td className="px-2 py-1.5 text-right">{curEst.videoPeak.toLocaleString()}회</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{newEst.videoPeak.toLocaleString()}회</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 text-gray-600">피크일 소비 (quota 대비)</td>
                    <td className="px-2 py-1.5 text-right">
                      {curEst.peakUnits.toLocaleString()}{" "}
                      <span className="text-gray-400">({curEst.pct.toFixed(1)}%)</span>
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-semibold ${
                        newEst.pct > 80 ? "text-red-600" : ""
                      }`}
                    >
                      {newEst.peakUnits.toLocaleString()}{" "}
                      <span className="text-gray-400">({newEst.pct.toFixed(1)}%)</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 text-gray-600">주간 총 소비</td>
                    <td className="px-2 py-1.5 text-right">{curEst.weekUnits.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{newEst.weekUnits.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
              일일 quota 한도 <strong>{QUOTA_PER_DAY.toLocaleString()}</strong> units. 여러 명이 동시에 봐도 서버가 간격당 1회로 합쳐 호출하므로 위 수치가 상한입니다.
              {newEst.pct > 100 && (
                <span className="text-red-600 font-semibold"> ⚠ 피크일 소비가 quota를 초과합니다 — 간격을 늘리세요.</span>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t pt-3">
        <button
          onClick={save}
          disabled={saving || !dirty || loading}
          className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {dirty && !loading && <span className="text-xs text-amber-700">변경사항이 있습니다.</span>}
        {msg && (
          <span className={`text-xs ${msg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
