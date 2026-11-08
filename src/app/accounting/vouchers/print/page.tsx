"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { evidenceNo, evidenceUrl, type EvidenceItem } from "@/components/accounting/Evidence";

/**
 * 전표 출력 — 기본: A4 1장에 전표 2건(위·아래 반쪽, 가운데 자르는 선). 1건이면 위쪽 반만.
 *   선택: 1장에 1건.
 *   결재란 · 전표정보 · 항목 · 합계 · 전자 증빙 목록
 *   실물 영수증은 출력한 전표(자른 반쪽) 뒷면에 붙여 보관 → 단면 인쇄 (뒷면을 비워 둠)
 *   항목이 많아 반쪽에 다 안 들어가는 전표(MAX_HALF_ITEMS 초과)는 자동으로 1장을 다 쓴다.
 *   ?ids=1,2,3  여러 전표를 한 번에
 *   화면 옵션 "증빙 이미지도 인쇄" — 이미지 증빙을 그 전표가 있는 쪽 다음에 이어서 인쇄 (PDF 는 목록만)
 */

interface PrintVoucher {
  id: number;
  voucherNo: string;
  type: string;
  date: string;
  description: string | null;
  totalAmount: number;
  isClosed: boolean;
  createdBy: string;
  createdAt: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
  unit?: { id: number; code: string; name: string };
  fund?: { id: number; name: string } | null;
  attachments?: EvidenceItem[];
  items: {
    id: number;
    seq: number;
    amount: number;
    description: string | null;
    counterpart: string | null;
    account: { code: string; name: string };
  }[];
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL = ["", "십", "백", "천"];
const BIG = ["", "만", "억", "조"];

/** 금액 한글 표기 — 1,234,000 → 일백이십삼만사천 */
function koreanAmount(n: number): string {
  if (n === 0) return "영";
  const neg = n < 0;
  let v = Math.abs(n);
  const groups: string[] = [];
  let g = 0;
  while (v > 0) {
    const chunk = v % 10000;
    if (chunk > 0) {
      let s = "";
      const ds = String(chunk).padStart(4, "0").split("").map(Number);
      ds.forEach((d, i) => {
        if (d > 0) s += DIGITS[d] + SMALL[3 - i];
      });
      groups.unshift(s + BIG[g]);
    }
    v = Math.floor(v / 10000);
    g++;
  }
  return (neg ? "(-) " : "") + groups.join("");
}

function stamp(at: string | null | undefined): string {
  if (!at) return "";
  const d = new Date(at);
  const k = new Date(d.getTime() + 9 * 3600 * 1000).toISOString();
  return `${k.slice(0, 10)} ${k.slice(11, 16)}`;
}

const isImage = (m: string) => m.startsWith("image/") && m !== "image/heic";

type Page =
  | { kind: "slips"; two: boolean; list: PrintVoucher[] }
  | { kind: "image"; v: PrintVoucher; a: EvidenceItem };

/** 반쪽(한 장에 2건)에 넣을 수 있는 최대 항목 수 — 넘으면 그 전표만 한 장을 다 씀 */
const MAX_HALF_ITEMS = 8;

function VoucherSlip({ v, half }: { v: PrintVoucher; half?: boolean }) {
  const income = v.type === "D";
  const atts = v.attachments ?? [];
  const minRows = half ? 4 : 6;
  const blanks = Math.max(0, minRows - v.items.length);
  return (
    <div className={half ? "slip half" : "slip full"}>
        {/* 제목 + 결재란 */}
        <div className="head">
          <div className="title-box">
            <div className="church">동천교회 · {v.unit?.name ?? ""}</div>
            <h1 className={income ? "t-in" : "t-out"}>{income ? "수 입 전 표" : "지 출 전 표"}</h1>
          </div>
          <table className="sign">
            <tbody>
              <tr>
                <th rowSpan={2} className="sign-label">
                  결<br />재
                </th>
                <th>담 당</th>
                <th>회 계</th>
                <th>확 인</th>
              </tr>
              <tr>
                <td />
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* 전표 정보 */}
        <table className="info">
          <tbody>
            <tr>
              <th>전표번호</th>
              <td className="mono strong">{v.voucherNo}</td>
              <th>전표일자</th>
              <td className="mono">{v.date.slice(0, 10)}</td>
              <th>회계단위</th>
              <td>{v.unit?.name ?? ""}</td>
            </tr>
            <tr>
              <th>{income ? "입금 통장" : "출금 통장"}</th>
              <td>{v.fund?.name ?? "기본 통장"}</td>
              <th>전표적요</th>
              <td colSpan={3}>{v.description ?? ""}</td>
            </tr>
          </tbody>
        </table>

        {/* 항목 */}
        <table className="items">
          <thead>
            <tr>
              <th style={{ width: "6%" }}>No</th>
              <th style={{ width: "24%" }}>계정과목</th>
              <th>적요</th>
              <th style={{ width: "17%" }}>{income ? "납부자" : "거래처"}</th>
              <th style={{ width: "17%" }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {v.items.map((it, i) => (
              <tr key={it.id}>
                <td className="c">{i + 1}</td>
                <td>
                  <span className="code">{it.account.code}</span> {it.account.name}
                </td>
                <td>{it.description ?? ""}</td>
                <td>{it.counterpart ?? ""}</td>
                <td className="r mono">{fmt(it.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`b${i}`} className="blank">
                <td />
                <td />
                <td />
                <td />
                <td />
              </tr>
            ))}
            <tr className="total">
              <td colSpan={2} className="c">
                합 계
              </td>
              <td colSpan={2} className="kor">
                금 {koreanAmount(v.totalAmount)}원정
              </td>
              <td className="r mono">{fmt(v.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        {/* 입력 · 증빙 */}
        <div className="meta">
          <span>
            입력 {v.createdBy} {stamp(v.createdAt)}
            {v.modifiedAt ? ` · 최종수정 ${v.modifiedBy ?? ""} ${stamp(v.modifiedAt)}` : ""}
          </span>
          <span>{v.isClosed ? "마감됨" : ""}</span>
        </div>
        <div className="evid">
          <b>전자 증빙 {atts.length}건</b>
          {atts.length > 0 ? (
            <span>
              {" "}
              — {atts.map((a) => `${evidenceNo(a)} (${a.origName})`).join(", ")}
            </span>
          ) : (
            <span> — 없음</span>
          )}
        </div>

    </div>
  );
}

function PrintInner() {
  const sp = useSearchParams();
  const ids = sp.get("ids") || "";
  const [vouchers, setVouchers] = useState<PrintVoucher[]>([]);
  const [error, setError] = useState<string | null>(ids ? null : "출력할 전표가 없습니다.");
  const [loading, setLoading] = useState(!!ids);
  const [withImages, setWithImages] = useState(false);
  const [perPage, setPerPage] = useState<1 | 2>(2); // 기본: A4 1장에 2건

  useEffect(() => {
    if (!ids) return;
    fetch(`/api/accounting/vouchers?ids=${encodeURIComponent(ids)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "전표를 불러오지 못했습니다.");
        const order = ids.split(",").map((x) => parseInt(x, 10));
        const list: PrintVoucher[] = d.vouchers || [];
        list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        setVouchers(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, [ids]);

  // 쪽 구성 — 2건 모드: 반쪽 두 개씩 채우되, 항목이 많은 전표는 한 장을 다 쓴다(순서 유지)
  const pages = useMemo(() => {
    const out: Page[] = [];
    const images = (vs: PrintVoucher[]) => {
      if (!withImages) return;
      for (const v of vs) for (const a of v.attachments ?? []) if (isImage(a.mimeType)) out.push({ kind: "image", v, a });
    };
    let pending: PrintVoucher[] = [];
    const flush = () => {
      if (pending.length === 0) return;
      out.push({ kind: "slips", two: true, list: pending });
      images(pending);
      pending = [];
    };
    for (const v of vouchers) {
      if (perPage === 1 || v.items.length > MAX_HALF_ITEMS) {
        flush();
        out.push({ kind: "slips", two: false, list: [v] });
        images([v]);
        continue;
      }
      pending.push(v);
      if (pending.length === 2) flush();
    }
    flush();
    return out;
  }, [vouchers, perPage, withImages]);
  const sheetCount = pages.filter((p) => p.kind === "slips").length;

  const imageCount = useMemo(
    () => vouchers.reduce((s, v) => s + (v.attachments ?? []).filter((a) => isImage(a.mimeType)).length, 0),
    [vouchers],
  );

  return (
    <div className="print-root">
      <style jsx global>{`
        /* 사이트 머리글·바닥글·회계 메뉴 숨김 — 깨끗한 양식만 */
        body > header,
        body > footer {
          display: none !important;
        }
        body > main {
          max-width: none !important;
          padding: 0 !important;
        }
        body > main aside {
          display: none !important;
        }
        body > main > div > div:first-child.lg\\:hidden {
          display: none !important;
        }
        body {
          background: #e5e7eb;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background: #fff;
          }
          .no-print {
            display: none !important;
          }
          .sheet {
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
          }
          .print-root > section.sheet:last-of-type {
            break-after: auto;
          }
        }
        .print-root {
          color: #111;
        }
        .sheet {
          width: 190mm;
          height: 276mm;
          margin: 0 auto 8mm;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          overflow: hidden;
        }
        .slip {
          display: flex;
          flex-direction: column;
          padding: 2mm 0;
        }
        .slip.full {
          height: 100%;
        }
        /* 한 장에 2건 — 위·아래 반쪽 (A4 인쇄 영역 약 277mm) */
        .sheet.two {
          display: flex;
          flex-direction: column;
        }
        .slip.half {
          height: 133mm;
          overflow: hidden;
        }
        .cut {
          position: relative;
          height: 0;
          margin: 3mm 0 4mm;
          border-top: 1px dashed #9ca3af;
        }
        .cut span {
          position: absolute;
          right: 0;
          top: -2.2mm;
          font-size: 7pt;
          color: #9ca3af;
          background: #fff;
          padding-left: 1.5mm;
        }
        .half .head {
          margin-bottom: 2mm;
        }
        .half .title-box {
          padding-top: 1mm;
        }
        .half .church {
          font-size: 9pt;
        }
        .half .title-box h1 {
          font-size: 16pt;
          margin-top: 1mm;
        }
        .half .sign {
          width: 54mm;
        }
        .half .sign th,
        .half .sign td {
          font-size: 8pt;
        }
        .half .sign td {
          height: 11mm;
        }
        .half .info th,
        .half .info td,
        .half .items th,
        .half .items td {
          padding: 1mm 1.6mm;
          font-size: 9pt;
        }
        .half .info {
          margin-bottom: 2mm;
        }
        .half .items .blank td {
          height: 5.5mm;
        }
        .half .code {
          font-size: 8pt;
        }
        .half .kor {
          font-size: 9pt;
        }
        .half .meta,
        .half .evid {
          font-size: 7.5pt;
        }
        .head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 4mm;
        }
        .title-box {
          flex: 1;
          text-align: center;
          padding-top: 3mm;
        }
        .church {
          font-size: 11pt;
          color: #444;
        }
        .title-box h1 {
          font-size: 22pt;
          font-weight: 800;
          letter-spacing: 0.35em;
          margin-top: 2mm;
        }
        .t-in {
          color: #1d4ed8;
        }
        .t-out {
          color: #b91c1c;
        }
        table {
          border-collapse: collapse;
          width: 100%;
        }
        .sign {
          width: 62mm;
        }
        .sign th,
        .sign td {
          border: 1px solid #333;
          font-size: 9pt;
          text-align: center;
        }
        .sign th {
          background: #f3f4f6;
          padding: 1mm 0;
          font-weight: 600;
        }
        .sign td {
          height: 16mm;
        }
        .sign .sign-label {
          width: 7mm;
          line-height: 1.6;
        }
        .info th,
        .info td,
        .items th,
        .items td {
          border: 1px solid #333;
          padding: 1.6mm 2mm;
          font-size: 10pt;
        }
        .info th,
        .items th {
          background: #f3f4f6;
          font-weight: 600;
          white-space: nowrap;
          text-align: center;
        }
        .info {
          margin-bottom: 3mm;
        }
        .items .blank td {
          height: 7mm;
        }
        .items .total td {
          font-weight: 700;
          background: #fafafa;
        }
        .c {
          text-align: center;
        }
        .r {
          text-align: right;
        }
        .mono {
          font-variant-numeric: tabular-nums;
        }
        .strong {
          font-weight: 700;
        }
        .code {
          color: #666;
          font-size: 9pt;
        }
        .kor {
          font-size: 10pt;
        }
        .meta {
          display: flex;
          justify-content: space-between;
          font-size: 8.5pt;
          color: #555;
          margin-top: 1.5mm;
        }
        .evid {
          font-size: 8.5pt;
          color: #333;
          margin-top: 1mm;
          word-break: break-all;
        }
        .ev-sheet {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2mm 0;
        }
        .ev-head {
          font-size: 9pt;
          color: #444;
          margin-bottom: 2mm;
          align-self: flex-start;
        }
        .ev-img {
          max-width: 100%;
          max-height: 262mm;
          object-fit: contain;
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 border-b border-gray-300 bg-white px-4 py-3 shadow-sm">
        <b className="text-gray-800">전표 출력</b>
        <span className="text-sm text-gray-500">
          {loading
            ? "불러오는 중..."
            : `전표 ${vouchers.length}건 · A4 ${sheetCount}장 · 뒷면에 영수증을 붙이므로 프린터는 '단면 인쇄'로`}
        </span>
        <span className="flex items-center gap-3 text-sm text-gray-700">
          <label className="flex items-center gap-1">
            <input type="radio" checked={perPage === 2} onChange={() => setPerPage(2)} />
            한 장에 2건
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={perPage === 1} onChange={() => setPerPage(1)} />
            한 장에 1건
          </label>
        </span>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
          증빙 이미지도 이어서 인쇄 ({imageCount}장)
        </label>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => window.print()}
          disabled={loading || vouchers.length === 0}
          className="rounded bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
        >
          인쇄
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          닫기
        </button>
      </div>

      {error && <div className="no-print mx-auto max-w-xl rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* 쪽(section)들을 형제로 두어 마지막 쪽만 쪽나눔 없이 */}
      {pages.map((pg, i) =>
        pg.kind === "image" ? (
          <section className="sheet ev-sheet" key={`i${i}`}>
            <div className="ev-head">
              {pg.v.voucherNo} 증빙 — {evidenceNo(pg.a)} ({pg.a.origName})
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={evidenceUrl(pg.a.id)} alt={pg.a.origName} className="ev-img" />
          </section>
        ) : pg.two ? (
          <section className="sheet two" key={`p${i}`}>
            <VoucherSlip v={pg.list[0]} half />
            {pg.list[1] && (
              <>
                <div className="cut">
                  <span>자르는 선</span>
                </div>
                <VoucherSlip v={pg.list[1]} half />
              </>
            )}
          </section>
        ) : (
          <section className="sheet" key={`p${i}`}>
            <VoucherSlip v={pg.list[0]} />
          </section>
        ),
      )}
    </div>
  );
}

export default function VoucherPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">불러오는 중...</div>}>
      <PrintInner />
    </Suspense>
  );
}
