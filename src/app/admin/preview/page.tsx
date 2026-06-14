"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================
// 해상도별 미리보기 + 라이브 간격 편집기.
// · iframe 을 지정 해상도 뷰포트로 렌더 → 그 해상도 기준 반응형이 그대로 보임.
// · 위젯 간격(게시글 행 높이 / 위젯 간 간격 / 줄 수)을 슬라이더로 조절하면
//   iframe 에 CSS 변수를 실시간 주입해 저장 전에 바로 미리보기.
// · [저장] 하면 site_settings(skin_widget_*) 에 반영 → 라이브 서비스 기준이 됨.
// · 푸터까지 들어오는지(scrollHeight) 수치로 ✓/✕ 표시.
// ============================================================

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1920×1080 (FHD)", w: 1920, h: 1080 },
  { label: "1680×1050", w: 1680, h: 1050 },
  { label: "1600×900", w: 1600, h: 900 },
  { label: "1440×900", w: 1440, h: 900 },
  { label: "1366×768 (노트북)", w: 1366, h: 768 },
  { label: "2560×1440 (QHD)", w: 2560, h: 1440 },
  { label: "1280×800 (태블릿 가로)", w: 1280, h: 800 },
  { label: "820×1180 (태블릿 세로)", w: 820, h: 1180 },
  { label: "390×844 (모바일)", w: 390, h: 844 },
];

const CHROME_PX = 120;

/** "1.75rem" / "28px" / "28" → px 정수 */
function toPx(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const m = String(v).trim().match(/^([\d.]+)\s*(px|rem)?$/);
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return fallback;
  return m[2] === "rem" ? Math.round(n * 16) : Math.round(n);
}

export default function ResolutionPreviewPage() {
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [excludeChrome, setExcludeChrome] = useState(true);
  const [scale, setScale] = useState(1);
  const [overflow, setOverflow] = useState<{ scrollH: number; viewH: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 간격 편집 상태 (px / 정수)
  const [rowH, setRowH] = useState(28);
  const [gap, setGap] = useState(8);
  const [rows, setRows] = useState(5);
  const [saved, setSaved] = useState<{ rowH: number; gap: number; rows: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const viewH = excludeChrome ? Math.max(200, h - CHROME_PX) : h;
  const dirty = !saved || saved.rowH !== rowH || saved.gap !== gap || saved.rows !== rows;

  // 현재 저장된 설정 로드
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        const rh = toPx(d.skin_widget_row_height, 28);
        const g = toPx(d.skin_widget_gap, 8);
        const rw = parseInt(d.skin_widget_rows || "5", 10) || 5;
        setRowH(rh);
        setGap(g);
        setRows(rw);
        setSaved({ rowH: rh, gap: g, rows: rw });
      })
      .catch(() => setSaved({ rowH: 28, gap: 8, rows: 5 }));
  }, []);

  const recomputeScale = useCallback(() => {
    const cw = (containerRef.current?.clientWidth || 0) - 4;
    setScale(cw > 0 ? Math.min(1, cw / w) : 1);
  }, [w]);

  useEffect(() => {
    recomputeScale();
    window.addEventListener("resize", recomputeScale);
    return () => window.removeEventListener("resize", recomputeScale);
  }, [recomputeScale]);

  // iframe 에 간격 CSS 변수 실시간 주입 + 컨텐츠 높이 측정
  const syncPreview = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) {
        setOverflow(null);
        return;
      }
      doc.documentElement.style.setProperty("--skin-widget-row-height", `${rowH}px`);
      doc.documentElement.style.setProperty("--skin-widget-gap", `${gap}px`);
      // 측정은 다음 프레임(레이아웃 반영 후)
      requestAnimationFrame(() => {
        try {
          const sh = Math.max(
            doc.documentElement.scrollHeight,
            doc.body?.scrollHeight || 0,
          );
          setOverflow({ scrollH: sh, viewH });
        } catch {
          setOverflow(null);
        }
      });
    } catch {
      setOverflow(null);
    }
  }, [rowH, gap, viewH]);

  // 값/뷰포트 변경 시 실시간 반영
  useEffect(() => {
    syncPreview();
  }, [syncPreview]);

  // 저장 — site_settings 반영 후 iframe 리로드(줄 수 등 서버 렌더 반영)
  const save = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skin_widget_row_height: `${rowH}px`,
          skin_widget_gap: `${gap}px`,
          skin_widget_rows: String(rows),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.message || "저장 실패");
      }
      setSaved({ rowH, gap, rows });
      setSavedMsg("저장됨 — 라이브 서비스에 반영되었습니다.");
      setReloadKey((k) => k + 1); // 줄 수 반영 위해 리로드
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const resetToSaved = () => {
    if (!saved) return;
    setRowH(saved.rowH);
    setGap(saved.gap);
    setRows(saved.rows);
    setReloadKey((k) => k + 1);
  };

  const fits = overflow ? overflow.scrollH <= overflow.viewH + 2 : null;
  const overBy = overflow ? overflow.scrollH - overflow.viewH : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-block w-1 h-7 bg-blue-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">해상도 미리보기 · 간격 조정</h1>
        <span className="text-xs text-gray-500">
          기준 해상도를 고르고, 보면서 간격을 조절한 뒤 저장 → 그 값이 서비스 기준이 됩니다.
        </span>
      </div>

      {/* 해상도 컨트롤 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active = p.w === w && p.h === h;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => { setW(p.w); setH(p.h); }}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  active ? "bg-blue-700 text-white border-blue-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-gray-500">가로(px)</span>
            <input type="number" value={w} onChange={(e) => setW(Math.max(320, parseInt(e.target.value, 10) || 0))}
              className="w-24 rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-gray-500">세로(px)</span>
            <input type="number" value={h} onChange={(e) => setH(Math.max(320, parseInt(e.target.value, 10) || 0))}
              className="w-24 rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={excludeChrome} onChange={(e) => setExcludeChrome(e.target.checked)} />
            브라우저 크롬(주소창·탭 {CHROME_PX}px) 제외
          </label>
          <span className="text-gray-500 text-xs ml-auto">
            렌더: <strong>{w}×{viewH}</strong> · 축소 {Math.round(scale * 100)}%
          </span>
        </div>
      </div>

      {/* 간격 편집기 */}
      <div className="bg-indigo-50/40 rounded-lg border border-indigo-200 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-indigo-800">위젯 간격 조정 (메인 화면)</span>
          {fits === null ? (
            <span className="text-gray-400 text-xs">측정 중…</span>
          ) : fits ? (
            <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              ✓ 푸터까지 들어옴 (콘텐츠 {overflow!.scrollH} ≤ {overflow!.viewH}px)
            </span>
          ) : (
            <span className="rounded bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-semibold text-rose-700">
              ✕ {overBy}px 초과 (콘텐츠 {overflow!.scrollH} &gt; {overflow!.viewH}px)
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {savedMsg && <span className="text-xs text-emerald-700">{savedMsg}</span>}
            {dirty && <span className="text-xs text-amber-600 font-medium">● 미저장</span>}
            <button type="button" onClick={resetToSaved} disabled={!dirty || saving}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40">
              되돌리기
            </button>
            <button type="button" onClick={save} disabled={!dirty || saving}
              className="rounded bg-indigo-600 px-4 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 게시글 행 높이 */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">게시글 행 높이 <strong className="text-indigo-700">{rowH}px</strong></span>
            <input type="range" min={16} max={36} value={rowH} onChange={(e) => setRowH(parseInt(e.target.value, 10))} />
            <input type="number" min={16} max={48} value={rowH} onChange={(e) => setRowH(parseInt(e.target.value, 10) || 16)}
              className="w-20 rounded border border-gray-300 px-2 py-0.5 text-sm" />
          </label>
          {/* 위젯 간 간격 */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">위젯 간 간격 <strong className="text-indigo-700">{gap}px</strong></span>
            <input type="range" min={0} max={24} value={gap} onChange={(e) => setGap(parseInt(e.target.value, 10))} />
            <input type="number" min={0} max={40} value={gap} onChange={(e) => setGap(parseInt(e.target.value, 10) || 0)}
              className="w-20 rounded border border-gray-300 px-2 py-0.5 text-sm" />
          </label>
          {/* 줄 수 */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">
              위젯당 줄 수 <strong className="text-indigo-700">{rows}</strong>
              <span className="text-gray-400"> (저장 후 반영)</span>
            </span>
            <input type="range" min={3} max={10} value={rows} onChange={(e) => setRows(parseInt(e.target.value, 10))} />
            <input type="number" min={3} max={10} value={rows} onChange={(e) => setRows(parseInt(e.target.value, 10) || 5)}
              className="w-20 rounded border border-gray-300 px-2 py-0.5 text-sm" />
          </label>
        </div>
        <p className="text-[11px] text-gray-500">
          행 높이·위젯 간격은 슬라이더 조절 즉시 미리보기에 반영됩니다(저장 전 미리보기). 줄 수는 서버 렌더라
          [저장] 후 반영됩니다. ✓ 가 뜰 때까지 줄이고 저장하면 그 값이 모든 사용자에게 적용됩니다.
        </p>
      </div>

      {/* 미리보기 */}
      <div ref={containerRef} className="bg-gray-100 rounded-lg border border-gray-200 p-2 overflow-auto">
        <div style={{ width: w * scale, height: viewH * scale }}
          className="relative mx-auto shadow-lg ring-1 ring-gray-300 overflow-hidden bg-white">
          <iframe
            key={`${w}-${viewH}-${reloadKey}`}
            ref={iframeRef}
            src="/"
            onLoad={syncPreview}
            title="resolution-preview"
            style={{ width: w, height: viewH, border: "0", transform: `scale(${scale})`, transformOrigin: "top left" }}
          />
        </div>
      </div>
    </div>
  );
}
