"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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

  // mount 후 자동 인쇄
  useEffect(() => {
    if (loaded && !error) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loaded, error]);

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

  return (
    <div className="print-thanks">
      {/* 인쇄용 스타일 — 브라우저 헤더/푸터를 최대한 줄이고 양식만 출력 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@page {
  size: A4;
  margin: 18mm 18mm 18mm 18mm;
}
@media print {
  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    color: #000 !important;
  }
  body > * { visibility: hidden !important; }
  .print-thanks, .print-thanks * { visibility: visible !important; }
  .print-thanks {
    position: absolute;
    inset: 0;
    padding: 0;
    font-family: "Malgun Gothic", "맑은 고딕", sans-serif;
  }
}
.print-thanks {
  font-family: "Malgun Gothic", "맑은 고딕", sans-serif;
  color: #000;
  font-size: 13px;
  line-height: 1.65;
  padding: 18mm;
  max-width: 210mm;
  margin: 0 auto;
}
.print-thanks ol { list-style: none; padding: 0; margin: 0; }
.print-thanks li {
  padding-left: 2.2em;
  text-indent: -2.2em;
  margin-bottom: 0.05em;
}
          `,
        }}
      />

      {mode === "ad" && <AdLayout date={dateStr} items={dataItems} footerLine={footerLine} />}
      {mode === "list" && <ListLayout date={dateStr} items={dataItems} footerLine={footerLine} />}
      {mode === "handout" && (
        <HandoutLayout date={dateStr} items={dataItems} footerLine={footerLine} />
      )}

      {/* 인쇄 종료 후 닫기 — 사용자가 인쇄 취소해도 창은 그대로 두고 직접 닫게 */}
      <div className="text-center mt-8 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          다시 인쇄
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="ml-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
        >
          창 닫기
        </button>
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
