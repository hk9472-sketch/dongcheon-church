"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================
// 해상도별 미리보기 — iframe 을 지정 해상도 크기로 띄워 그 뷰포트 기준으로
// 실제 반응형(미디어쿼리)이 적용된 모습을 보여준다. 화면 폭에 맞춰 축소 표시.
// 푸터까지 스크롤 없이 들어오는지(scrollHeight vs 높이) 수치로 표시.
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

const PATHS = [
  { label: "메인", path: "/" },
  { label: "방문 로그", path: "/admin/visit-logs" },
  { label: "연보 통합 입력", path: "/accounting/offering/multi-entry" },
];

// 1920×1080 모니터 100% = 브라우저 크롬 제외 실제 뷰포트 ≈ 956px.
// 미리보기는 '크롬 제외 실제 뷰포트'를 가정하는 게 정확하므로 보정 옵션 제공.
const CHROME_PX = 120;

export default function ResolutionPreviewPage() {
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [path, setPath] = useState("/");
  const [excludeChrome, setExcludeChrome] = useState(true);
  const [scale, setScale] = useState(1);
  const [overflow, setOverflow] = useState<{ scrollH: number; viewH: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 크롬(주소창/탭) 높이를 뺀 실제 뷰포트 높이
  const viewH = excludeChrome ? Math.max(200, h - CHROME_PX) : h;

  const recomputeScale = useCallback(() => {
    const cw = (containerRef.current?.clientWidth || 0) - 4;
    setScale(cw > 0 ? Math.min(1, cw / w) : 1);
  }, [w]);

  useEffect(() => {
    recomputeScale();
    window.addEventListener("resize", recomputeScale);
    return () => window.removeEventListener("resize", recomputeScale);
  }, [recomputeScale]);

  // iframe 로드 후 컨텐츠 높이 측정 (same-origin 이라 접근 가능)
  const onLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const sh = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight || 0,
        );
        setOverflow({ scrollH: sh, viewH });
      } else setOverflow(null);
    } catch {
      setOverflow(null);
    }
  };

  const applyPreset = (p: { w: number; h: number }) => {
    setW(p.w);
    setH(p.h);
    setOverflow(null);
  };

  const fits = overflow ? overflow.scrollH <= overflow.viewH + 2 : null;
  const overBy = overflow ? overflow.scrollH - overflow.viewH : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-block w-1 h-7 bg-blue-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">해상도 미리보기</h1>
        <span className="text-xs text-gray-500">
          지정 해상도의 뷰포트로 렌더 → 반응형(압축 등) 실제 모습 + 푸터까지 들어오는지 확인
        </span>
      </div>

      {/* 컨트롤 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active = p.w === w && p.h === h;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  active
                    ? "bg-blue-700 text-white border-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
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
            <input
              type="number"
              value={w}
              onChange={(e) => setW(Math.max(320, parseInt(e.target.value, 10) || 0))}
              className="w-24 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-gray-500">세로(px)</span>
            <input
              type="number"
              value={h}
              onChange={(e) => setH(Math.max(320, parseInt(e.target.value, 10) || 0))}
              className="w-24 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-gray-500">페이지</span>
            <select
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              {PATHS.map((p) => (
                <option key={p.path} value={p.path}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={excludeChrome}
              onChange={(e) => setExcludeChrome(e.target.checked)}
            />
            브라우저 크롬(주소창·탭 {CHROME_PX}px) 제외해 실제 뷰포트로
          </label>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            ↻ 새로고침
          </button>
        </div>

        {/* 적합 여부 */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-500 text-xs">
            렌더 뷰포트: <strong>{w}×{viewH}</strong>
            {excludeChrome && <span className="text-gray-400"> (모니터 {h} − 크롬 {CHROME_PX})</span>}
            {" · "}축소 {Math.round(scale * 100)}%
          </span>
          {fits === null ? (
            <span className="text-gray-400 text-xs">측정 중…</span>
          ) : fits ? (
            <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              ✓ 푸터까지 한 화면에 들어옴 (콘텐츠 {overflow!.scrollH}px ≤ {overflow!.viewH}px)
            </span>
          ) : (
            <span className="rounded bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-semibold text-rose-700">
              ✕ {overBy}px 초과 — 스크롤 발생 (콘텐츠 {overflow!.scrollH}px &gt; {overflow!.viewH}px)
            </span>
          )}
        </div>
      </div>

      {/* 미리보기 — 지정 해상도 iframe 을 화면 폭에 맞춰 축소 */}
      <div
        ref={containerRef}
        className="bg-gray-100 rounded-lg border border-gray-200 p-2 overflow-auto"
      >
        <div
          style={{ width: w * scale, height: viewH * scale }}
          className="relative mx-auto shadow-lg ring-1 ring-gray-300 overflow-hidden bg-white"
        >
          <iframe
            key={`${w}-${viewH}-${path}-${reloadKey}`}
            ref={iframeRef}
            src={path}
            onLoad={onLoad}
            title="resolution-preview"
            style={{
              width: w,
              height: viewH,
              border: "0",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 border border-gray-200 rounded-md p-3">
        · iframe 을 실제 해상도 크기로 렌더하므로 그 안의 <strong>미디어쿼리(압축 등)가 그 해상도 기준</strong>으로 적용됩니다.
        1920×1080 선택 시 1080p 압축 레이아웃을 그대로 봅니다.<br />
        · <strong>브라우저 크롬 제외</strong> 체크 시, 실제로 보이는 영역(주소창·탭 약 {CHROME_PX}px 제외)을 기준으로 적합 여부를 판정합니다 — 이게 사용자 실제 화면에 가깝습니다.<br />
        · ✓/✕ 표시로 그 해상도에서 푸터까지 들어오는지 수치로 확인하고, 그에 맞춰 위젯 간격 기준을 정하면 됩니다.
      </p>
    </div>
  );
}
