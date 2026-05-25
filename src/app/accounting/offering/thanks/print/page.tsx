"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Mode = "ad" | "list" | "handout";

interface Entry {
  id: number;
  date: string;
  description: string | null;
}

// 헤더/리스트의 1~3 고정 항목
const FIXED_LEADS = ["십일조 연보", "감사 연보", "수지 연보"];

// 광고용에 들어가는 데이터 개수 (4번 ~ 10번 = 7개)
const AD_DATA_COUNT = 7;

// 등재용 구분선 위치 — 1~6 표시 후 구분선 (4~6 = 데이터 첫 3개)
const LIST_DIVIDER_AFTER_DATA = 3;

function formatDateAd(s: string): string {
  // 광고용: (2026.05.24.)
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `(${y}.${m}.${dd}.)`;
}
function formatDateList(s: string): string {
  // 등재용: (2026.05.17)
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `(${y}.${m}.${dd})`;
}
function formatDateHandout(s: string): string {
  // 배부용: (2026. 05. 17. 주일)
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `(${y}. ${m}. ${dd}. 주일)`;
}

export default function ThanksOfferingPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">불러오는 중...</div>}>
      <PrintInner />
    </Suspense>
  );
}

function PrintInner() {
  const sp = useSearchParams();
  const mode = (sp.get("mode") || "ad") as Mode;
  const dateStr = sp.get("date") || "";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [envelopeCount, setEnvelopeCount] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 페이지 여백 (mm) — 4 방향 개별 조정. localStorage 에 저장.
  const MARGIN_KEY = "thanksPrintMargins.v1";
  const DEFAULT_MARGINS = { top: 18, right: 18, bottom: 18, left: 18 };
  const [margins, setMargins] = useState(DEFAULT_MARGINS);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MARGIN_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (
          typeof v.top === "number" &&
          typeof v.right === "number" &&
          typeof v.bottom === "number" &&
          typeof v.left === "number"
        ) {
          setMargins(v);
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(MARGIN_KEY, JSON.stringify(margins));
    } catch {}
  }, [margins]);

  /** 핸들 드래그 — side = top|right|bottom|left */
  const startDrag = (
    side: "top" | "right" | "bottom" | "left",
    e: React.PointerEvent,
  ) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const box = previewRef.current?.getBoundingClientRect();
    if (!box) return;
    // A4 비율 가정 — width = 210mm
    const pxPerMm = box.width / 210;
    const startX = e.clientX;
    const startY = e.clientY;
    const startVal = margins[side];

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let next = startVal;
      if (side === "top") next = startVal + dy / pxPerMm;
      else if (side === "bottom") next = startVal - dy / pxPerMm;
      else if (side === "left") next = startVal + dx / pxPerMm;
      else if (side === "right") next = startVal - dx / pxPerMm;
      next = Math.max(0, Math.min(60, Math.round(next * 10) / 10));
      setMargins((m) => ({ ...m, [side]: next }));
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const resetMargins = () => setMargins(DEFAULT_MARGINS);

  useEffect(() => {
    if (!dateStr) {
      setError("기준일자가 지정되지 않았습니다.");
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [eRes, sRes] = await Promise.all([
          fetch(
            `/api/accounting/offering/entries?offeringType=감사연보&dateFrom=${dateStr}&dateTo=${dateStr}`,
          ),
          fetch(`/api/accounting/offering/settlement?date=${dateStr}`),
        ]);
        const eData = await eRes.json();
        const sData = await sRes.json();
        if (cancelled) return;
        const list: Entry[] = Array.isArray(eData) ? eData : eData.entries || [];
        setEntries(list);
        // 결산이 saved 면 envelopeCount 표시, 아니면 0
        if (sData?.mode === "saved" && sData.settlement?.envelopeCount) {
          setEnvelopeCount(sData.settlement.envelopeCount);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "조회 실패");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  // description 별 중복 제거 (입력 순서 유지, 빈 description 제외)
  const dataItems: string[] = useMemo(() => {
    // 같은 날짜 안에서 입력 순(id asc) 으로 보고 싶어서 reverse — entries 는 id desc 정렬.
    // 만약 정렬이 바뀌면 여기를 조정.
    const ordered = [...entries].sort((a, b) => a.id - b.id);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of ordered) {
      const d = (e.description || "").trim();
      if (!d) continue;
      if (d === "결산차액") continue;
      if (seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out;
  }, [entries]);

  // 총 종류 = 고정 3 + 데이터 종류
  const totalKinds = FIXED_LEADS.length + dataItems.length;

  // (자동 인쇄 제거 — 사용자가 미리보기에서 여백 조정 후 직접 인쇄 버튼을 누름)

  if (!loaded) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">불러오는 중...</div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-center text-red-600 text-sm">{error}</div>
    );
  }

  const footerLine = `${totalKinds} 종류의 감사연보를 ${envelopeCount || 0} 분이 드렸습니다.`;

  const css = `
@page {
  size: A4;
  margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
}
.thanks-content {
  font-family: "Malgun Gothic", "맑은 고딕", sans-serif;
  color: #000;
  font-size: 13px;
  line-height: 1.65;
  background: #fff;
}
.thanks-content ol { list-style: none; padding: 0; margin: 0; }
.thanks-content li {
  padding-left: 2.2em;
  text-indent: -2.2em;
  margin-bottom: 0.05em;
}
/* 실제 인쇄 영역 — 화면에서는 숨김, 인쇄 시에만 노출 */
.print-target {
  position: fixed;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}
@media print {
  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    color: #000 !important;
  }
  body > * { visibility: hidden !important; }
  .no-print { display: none !important; }
  .print-target, .print-target * { visibility: visible !important; }
  .print-target {
    position: absolute !important;
    inset: 0 !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    z-index: auto !important;
    padding: 0 !important;
    margin: 0 !important;
    width: auto !important;
    height: auto !important;
    box-shadow: none !important;
    border: none !important;
  }
}
  `;

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* 컨트롤 패널 + 미리보기 — 인쇄 시 모두 숨김 */}
      <div className="no-print bg-gray-50 min-h-screen py-6">
        <div className="max-w-4xl mx-auto px-4 mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-gray-800">
            감사연보 인쇄 미리보기{" "}
            <span className="text-sm text-gray-500 font-normal">
              ({mode === "ad" ? "광고용" : mode === "list" ? "등재용" : "배부용"} · {dateStr})
            </span>
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-xs text-gray-600">
              여백 (mm) · 상 <strong>{margins.top}</strong> · 우{" "}
              <strong>{margins.right}</strong> · 하 <strong>{margins.bottom}</strong> · 좌{" "}
              <strong>{margins.left}</strong>
            </div>
            <button
              type="button"
              onClick={resetMargins}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
            >
              여백 초기화 (18mm)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold"
            >
              🖨 인쇄
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 4 방향 여백 슬라이더 (드래그 핸들과 함께 정밀 조정) */}
        <div className="max-w-4xl mx-auto px-4 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {(["top", "right", "bottom", "left"] as const).map((side) => {
            const label = side === "top" ? "상" : side === "right" ? "우" : side === "bottom" ? "하" : "좌";
            return (
              <label key={side} className="flex items-center gap-2 bg-white border border-gray-200 rounded px-2 py-1">
                <span className="text-gray-600 font-semibold w-4">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.5}
                  value={margins[side]}
                  onChange={(e) => setMargins((m) => ({ ...m, [side]: parseFloat(e.target.value) }))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={margins[side]}
                  onChange={(e) =>
                    setMargins((m) => ({
                      ...m,
                      [side]: Math.max(0, Math.min(60, parseFloat(e.target.value) || 0)),
                    }))
                  }
                  className="w-14 rounded border border-gray-300 px-1 py-0.5 text-right font-mono"
                />
                <span className="text-gray-400">mm</span>
              </label>
            );
          })}
        </div>

        <p className="max-w-4xl mx-auto px-4 mb-3 text-[11px] text-gray-500">
          미리보기의 <strong className="text-blue-700">파란 점선</strong> 가장자리를
          드래그하거나 위의 슬라이더로 4 방향 여백을 조정할 수 있습니다. 변경 사항은
          자동 저장되어 다음 인쇄에도 유지됩니다. 인쇄 대화상자에서 <strong>“헤더 및
          바닥글”</strong> 옵션을 끄세요.
        </p>

        {/* A4 미리보기 박스 — 비율 210:297 = 1 : 1.414 */}
        <div className="max-w-4xl mx-auto px-4">
          <div
            ref={previewRef}
            className="relative bg-white shadow-lg mx-auto"
            style={{
              width: "min(800px, 100%)",
              aspectRatio: "210 / 297",
              maxWidth: "100%",
            }}
          >
            {/* 실제 콘텐츠 — 여백 안쪽 */}
            <div
              className="absolute inset-0 thanks-content"
              style={{
                paddingTop: `${margins.top}mm`,
                paddingRight: `${margins.right}mm`,
                paddingBottom: `${margins.bottom}mm`,
                paddingLeft: `${margins.left}mm`,
              }}
            >
              {mode === "ad" && (
                <AdLayout date={dateStr} items={dataItems} footerLine={footerLine} />
              )}
              {mode === "list" && (
                <ListLayout date={dateStr} items={dataItems} footerLine={footerLine} />
              )}
              {mode === "handout" && (
                <HandoutLayout date={dateStr} items={dataItems} footerLine={footerLine} />
              )}
            </div>

            {/* 4 방향 여백 핸들 — 파란 점선 + 드래그 가능 */}
            {/* 위 */}
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-blue-500 cursor-ns-resize hover:bg-blue-100/30"
              style={{ top: `${margins.top}mm`, height: "8px", transform: "translateY(-4px)" }}
              onPointerDown={(e) => startDrag("top", e)}
              title={`위 ${margins.top}mm — 드래그`}
            />
            {/* 아래 */}
            <div
              className="absolute left-0 right-0 border-b-2 border-dashed border-blue-500 cursor-ns-resize hover:bg-blue-100/30"
              style={{ bottom: `${margins.bottom}mm`, height: "8px", transform: "translateY(4px)" }}
              onPointerDown={(e) => startDrag("bottom", e)}
              title={`아래 ${margins.bottom}mm — 드래그`}
            />
            {/* 왼쪽 */}
            <div
              className="absolute top-0 bottom-0 border-l-2 border-dashed border-blue-500 cursor-ew-resize hover:bg-blue-100/30"
              style={{ left: `${margins.left}mm`, width: "8px", transform: "translateX(-4px)" }}
              onPointerDown={(e) => startDrag("left", e)}
              title={`왼쪽 ${margins.left}mm — 드래그`}
            />
            {/* 오른쪽 */}
            <div
              className="absolute top-0 bottom-0 border-r-2 border-dashed border-blue-500 cursor-ew-resize hover:bg-blue-100/30"
              style={{ right: `${margins.right}mm`, width: "8px", transform: "translateX(4px)" }}
              onPointerDown={(e) => startDrag("right", e)}
              title={`오른쪽 ${margins.right}mm — 드래그`}
            />
          </div>
        </div>
      </div>

      {/* 실제 인쇄용 영역 — 화면에서는 opacity:0 으로 숨김, @media print 에서만 노출.
          @page margin 이 적용되므로 여기서는 별도 padding 없이 콘텐츠만 배치. */}
      <div className="print-target thanks-content" aria-hidden>
        {mode === "ad" && (
          <AdLayout date={dateStr} items={dataItems} footerLine={footerLine} />
        )}
        {mode === "list" && (
          <ListLayout date={dateStr} items={dataItems} footerLine={footerLine} />
        )}
        {mode === "handout" && (
          <HandoutLayout date={dateStr} items={dataItems} footerLine={footerLine} />
        )}
      </div>
    </div>
  );
}

/* ============ 광고용 ============ */
function AdLayout({ date, items, footerLine }: { date: string; items: string[]; footerLine: string }) {
  const shown = items.slice(0, AD_DATA_COUNT); // 데이터 첫 7개 → 4~10번
  return (
    <div>
      {/* 헤더: "광 고" + 우측 (날짜) */}
      <div style={{ position: "relative", marginBottom: "1.2em" }}>
        <div
          style={{
            textAlign: "center",
            fontSize: "26px",
            fontWeight: "bold",
            letterSpacing: "0.5em",
            paddingLeft: "0.5em",
          }}
        >
          광 고
        </div>
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: "-0.2em",
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          {formatDateAd(date)}
        </div>
      </div>

      {/* 안내문 3줄 — 고정 */}
      <div style={{ marginTop: "1.4em", marginBottom: "1.6em" }}>
        <div>∙ 하루에 30분씩 기도합시다.</div>
        <div>∙ 매일 성경 읽고 성경 공부에 힘씁시다.</div>
        <div>∙ 오후 예배는 2시입니다.</div>
      </div>

      {/* "지난 주 감사연보" */}
      <div style={{ fontWeight: "bold", fontSize: "15px", marginTop: "1.4em", marginBottom: "0.6em" }}>
        지난 주 감사연보
      </div>

      <ol>
        {FIXED_LEADS.map((label, i) => (
          <li key={`fix-${i}`}>
            {i + 1}. {label}
          </li>
        ))}
        {shown.map((d, i) => (
          <li key={`d-${i}`}>
            {FIXED_LEADS.length + i + 1}. {d}
          </li>
        ))}
      </ol>

      {/* 푸터 */}
      <div style={{ marginTop: "2em" }}>
        <div style={{ fontWeight: "bold" }}>이상의 감사를 포함하여</div>
        <div style={{ fontWeight: "bold" }}>총 {footerLine}</div>
      </div>
    </div>
  );
}

/* ============ 등재용 (1단, 전체, 6번 후 구분선) ============ */
function ListLayout({ date, items, footerLine }: { date: string; items: string[]; footerLine: string }) {
  // 1~3 고정 + 데이터 첫 LIST_DIVIDER_AFTER_DATA 개(4~6) + 구분선 + 나머지
  const above = items.slice(0, LIST_DIVIDER_AFTER_DATA);
  const below = items.slice(LIST_DIVIDER_AFTER_DATA);

  return (
    <div>
      {/* 헤더 — 좌측 "지난주 감사연보" + 우측 (날짜) */}
      <div style={{ position: "relative", marginBottom: "1em" }}>
        <div style={{ fontSize: "16px", fontWeight: "bold" }}>지난주 감사연보</div>
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          {formatDateList(date)}
        </div>
      </div>

      <ol>
        {FIXED_LEADS.map((label, i) => (
          <li key={`fix-${i}`}>
            {i + 1}. {label}
          </li>
        ))}
        {above.map((d, i) => (
          <li key={`a-${i}`}>
            {FIXED_LEADS.length + i + 1}. {d}
          </li>
        ))}
      </ol>

      {/* 구분선 — 첨부 양식의 ㅡㅡㅡㅡ 재현 */}
      {below.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #000",
            margin: "0.2em 0 0.2em 0",
            height: 0,
          }}
        />
      )}

      <ol>
        {below.map((d, i) => (
          <li key={`b-${i}`}>
            {FIXED_LEADS.length + above.length + i + 1}. {d}
          </li>
        ))}
      </ol>

      <div style={{ marginTop: "1.6em", fontWeight: "bold" }}>{footerLine}</div>
    </div>
  );
}

/* ============ 배부용 (2단, 전체) ============ */
function HandoutLayout({ date, items, footerLine }: { date: string; items: string[]; footerLine: string }) {
  const fullList = [
    ...FIXED_LEADS.map((label, i) => ({ no: i + 1, text: label })),
    ...items.map((d, i) => ({ no: FIXED_LEADS.length + i + 1, text: d })),
  ];

  return (
    <div>
      {/* 헤더 — 큰 글자 좌측 정렬: "감사연보 내역 (2026. 05. 17. 주일)" */}
      <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "0.8em" }}>
        감사연보 내역 {formatDateHandout(date)}
      </div>

      {/* 2단 컬럼 */}
      <div
        style={{
          columnCount: 2,
          columnGap: "1.2em",
          columnRule: "0px solid transparent",
        }}
      >
        <ol>
          {fullList.map((item) => (
            <li key={item.no} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
              {item.no}. {item.text}
            </li>
          ))}
        </ol>
      </div>

      <div style={{ marginTop: "1.4em", fontWeight: "bold" }}>{footerLine}</div>
    </div>
  );
}
