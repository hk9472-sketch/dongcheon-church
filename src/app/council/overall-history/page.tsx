"use client";

import { useState, useEffect, useCallback } from "react";
import { handleArrowNav } from "@/lib/useArrowNav";

interface DistrictRow {
  groupId: number;
  groupName: string;
  adultSam: number; adultOh: number; adultJupre: number; adultJuhu: number;
  midSam: number; midOh: number; midJupre: number; midJuhu: number;
  bible: number; prayer: number;
}

interface TeacherRow {
  sortOrder: number;
  className: string;
  teacherName: string;
  jugyo: number; midJugyo1: number; midJugyo2: number; midMiddle: number; midAdult: number;
  jugyoAfternoon: number;
}

interface WeeklySummary {
  sam: number; oh: number;
  amAdult: number; amMid: number;
  pmAdult: number; pmMid: number;
  jugyo: number; midService: number; dawn: number;
  maleBible: number; femaleBible: number;
  afternoonSermon: string | null;
}

interface SingleDayData {
  date: string;
  districts: DistrictRow[];
  teachers: TeacherRow[];
  weekly: WeeklySummary | null;
}

interface RangeItem {
  date: string;
  weekly: WeeklySummary | null;
  district: { _sum: Record<string, number> } | null;
  teacher: { _sum: Record<string, number> } | null;
}

type Tab = "single" | "range";

function todayStr() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysAgoStr(days: number) {
  return new Date(Date.now() + 9 * 3600 * 1000 - days * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);
}

export default function OverallHistoryPage() {
  const [tab, setTab] = useState<Tab>("single");
  const [singleDate, setSingleDate] = useState(todayStr());
  const [from, setFrom] = useState(daysAgoStr(60));
  const [to, setTo] = useState(todayStr());
  const [singleData, setSingleData] = useState<SingleDayData | null>(null);
  const [rangeData, setRangeData] = useState<RangeItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSingle = useCallback(() => {
    setLoading(true);
    fetch(`/api/council/overall-history?date=${singleDate}`)
      .then((r) => r.json())
      .then((d) => setSingleData(d))
      .catch(() => setSingleData(null))
      .finally(() => setLoading(false));
  }, [singleDate]);

  const loadRange = useCallback(() => {
    setLoading(true);
    fetch(`/api/council/overall-history?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setRangeData(d.list || []))
      .catch(() => setRangeData([]))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    if (tab === "single") loadSingle();
    else loadRange();
  }, [tab, loadSingle, loadRange]);

  // 구역 합계 (단일)
  const districtTotals = (() => {
    if (!singleData) return null;
    const t = {
      adultSam: 0, adultOh: 0, adultJupre: 0, adultJuhu: 0,
      midSam: 0, midOh: 0, midJupre: 0, midJuhu: 0,
      bible: 0, prayer: 0,
    };
    for (const d of singleData.districts) {
      t.adultSam += d.adultSam; t.adultOh += d.adultOh;
      t.adultJupre += d.adultJupre; t.adultJuhu += d.adultJuhu;
      t.midSam += d.midSam; t.midOh += d.midOh;
      t.midJupre += d.midJupre; t.midJuhu += d.midJuhu;
      t.bible += d.bible; t.prayer += d.prayer;
    }
    return t;
  })();

  // 기간 합계 (range)
  const rangeTotals = (() => {
    const t = {
      sam: 0, oh: 0, amAdult: 0, amMid: 0, pmAdult: 0, pmMid: 0,
      jugyo: 0, midService: 0, dawn: 0,
      adultJupre: 0, midJupre: 0, bible: 0, prayer: 0,
    };
    for (const r of rangeData) {
      if (r.weekly) {
        t.sam += r.weekly.sam; t.oh += r.weekly.oh;
        t.amAdult += r.weekly.amAdult; t.amMid += r.weekly.amMid;
        t.pmAdult += r.weekly.pmAdult; t.pmMid += r.weekly.pmMid;
        t.jugyo += r.weekly.jugyo; t.midService += r.weekly.midService;
        t.dawn += r.weekly.dawn;
      }
      if (r.district?._sum) {
        t.adultJupre += r.district._sum.adultJupre || 0;
        t.midJupre += r.district._sum.midJupre || 0;
        t.bible += r.district._sum.bibleMale || 0;
        t.prayer += r.district._sum.prayer || 0;
      }
    }
    return t;
  })();

  const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-base font-bold text-gray-800">전체출석보고 — 조회·집계</h1>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 print:hidden"
        >
          인쇄
        </button>
      </div>

      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setTab("single")}
          className={`px-4 py-1.5 text-sm rounded transition-colors ${
            tab === "single" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          일자 조회
        </button>
        <button
          type="button"
          onClick={() => setTab("range")}
          className={`px-4 py-1.5 text-sm rounded transition-colors ${
            tab === "range" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          기간 집계
        </button>
      </div>

      {tab === "single" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 print:hidden">
            <label className="text-sm text-gray-600">날짜</label>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className={inputCls}
              onKeyDown={handleArrowNav}
            />
            <button
              onClick={loadSingle}
              disabled={loading}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "로딩..." : "조회"}
            </button>
          </div>

          {!loading && singleData && (
            <>
              {/* 주간 요약 */}
              {singleData.weekly ? (
                <div>
                  <h2 className="text-sm font-bold text-gray-700 mb-2">전체출석요약</h2>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-2 py-1">삼일</th>
                        <th className="border border-gray-300 px-2 py-1">오일</th>
                        <th className="border border-gray-300 px-2 py-1 bg-blue-50">주일오전<br/>장년</th>
                        <th className="border border-gray-300 px-2 py-1 bg-blue-50">주일오전<br/>중간</th>
                        <th className="border border-gray-300 px-2 py-1 bg-blue-50">주일오전<br/>계</th>
                        <th className="border border-gray-300 px-2 py-1 bg-green-50">주일오후<br/>장년</th>
                        <th className="border border-gray-300 px-2 py-1 bg-green-50">주일오후<br/>중간</th>
                        <th className="border border-gray-300 px-2 py-1 bg-green-50">주일오후<br/>계</th>
                        <th className="border border-gray-300 px-2 py-1">주교</th>
                        <th className="border border-gray-300 px-2 py-1">중간반<br/>예배</th>
                        <th className="border border-gray-300 px-2 py-1">새벽</th>
                        <th className="border border-gray-300 px-2 py-1">남반<br/>성경</th>
                        <th className="border border-gray-300 px-2 py-1">여반<br/>성경</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.sam}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.oh}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.amAdult}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.amMid}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center font-bold bg-blue-50/50">
                          {singleData.weekly.amAdult + singleData.weekly.amMid}
                        </td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.pmAdult}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.pmMid}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center font-bold bg-green-50/50">
                          {singleData.weekly.pmAdult + singleData.weekly.pmMid}
                        </td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.jugyo}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.midService}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.dawn}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.maleBible}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">{singleData.weekly.femaleBible}</td>
                      </tr>
                    </tbody>
                  </table>
                  {singleData.weekly.afternoonSermon && (
                    <div className="mt-2 text-xs text-gray-600">오후 설교: <strong>{singleData.weekly.afternoonSermon}</strong></div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400 py-4">이 일자의 전체출석요약이 없습니다.</div>
              )}

              {/* 구역별 성적 */}
              {singleData.districts.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-700 mb-2">구역별 성적</h2>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-2 py-1">구역</th>
                        <th className="border border-gray-300 px-2 py-1 bg-blue-50" colSpan={5}>장년반</th>
                        <th className="border border-gray-300 px-2 py-1 bg-green-50" colSpan={5}>중간반</th>
                        <th className="border border-gray-300 px-2 py-1 bg-orange-50">총계</th>
                        <th className="border border-gray-300 px-2 py-1 bg-purple-50">성경</th>
                        <th className="border border-gray-300 px-2 py-1">기도</th>
                      </tr>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-1 py-1"></th>
                        <th className="border border-gray-300 px-1 py-1 bg-blue-50">삼일</th>
                        <th className="border border-gray-300 px-1 py-1 bg-blue-50">오일</th>
                        <th className="border border-gray-300 px-1 py-1 bg-blue-50">주전</th>
                        <th className="border border-gray-300 px-1 py-1 bg-blue-50">주후</th>
                        <th className="border border-gray-300 px-1 py-1 bg-blue-50">계</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">삼일</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">오일</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">주전</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">주후</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">계</th>
                        <th className="border border-gray-300 px-1 py-1 bg-orange-50">금주</th>
                        <th className="border border-gray-300 px-1 py-1 bg-purple-50">합계</th>
                        <th className="border border-gray-300 px-1 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {singleData.districts.map((d) => {
                        const aT = d.adultSam + d.adultOh + d.adultJupre + d.adultJuhu;
                        const mT = d.midSam + d.midOh + d.midJupre + d.midJuhu;
                        return (
                          <tr key={d.groupId} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-2 py-1 font-medium">{d.groupName}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.adultSam}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.adultOh}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.adultJupre}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.adultJuhu}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-blue-50/50">{aT}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.midSam}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.midOh}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.midJupre}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.midJuhu}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-green-50/50">{mT}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-orange-50/50">{aT + mT}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center bg-purple-50/50">{d.bible}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{d.prayer}</td>
                          </tr>
                        );
                      })}
                      {districtTotals && (
                        <tr className="bg-yellow-50 font-bold">
                          <td className="border border-gray-300 px-2 py-1 text-center">계</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultSam}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultOh}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultJupre}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultJuhu}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center bg-blue-100/50">
                            {districtTotals.adultSam + districtTotals.adultOh + districtTotals.adultJupre + districtTotals.adultJuhu}
                          </td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midSam}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midOh}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midJupre}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midJuhu}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center bg-green-100/50">
                            {districtTotals.midSam + districtTotals.midOh + districtTotals.midJupre + districtTotals.midJuhu}
                          </td>
                          <td className="border border-gray-300 px-1 py-1 text-center bg-orange-100/50">
                            {districtTotals.adultSam + districtTotals.adultOh + districtTotals.adultJupre + districtTotals.adultJuhu +
                             districtTotals.midSam + districtTotals.midOh + districtTotals.midJupre + districtTotals.midJuhu}
                          </td>
                          <td className="border border-gray-300 px-1 py-1 text-center bg-purple-100/50">{districtTotals.bible}</td>
                          <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.prayer}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 반사별 성적 */}
              {singleData.teachers.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-700 mb-2">반사별 성적</h2>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-2 py-1">순서</th>
                        <th className="border border-gray-300 px-2 py-1">반</th>
                        <th className="border border-gray-300 px-2 py-1">반사</th>
                        <th className="border border-gray-300 px-2 py-1">주교</th>
                        <th className="border border-gray-300 px-2 py-1 bg-green-50" colSpan={4}>중간반</th>
                        <th className="border border-gray-300 px-2 py-1 bg-orange-50">현재</th>
                        <th className="border border-gray-300 px-2 py-1">주교<br/>오후</th>
                      </tr>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-1 py-1" colSpan={4}></th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">중1</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">중2</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">중간</th>
                        <th className="border border-gray-300 px-1 py-1 bg-green-50">장년</th>
                        <th className="border border-gray-300 px-1 py-1" colSpan={2}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {singleData.teachers.map((t) => {
                        const cur = t.jugyo + t.midJugyo1 + t.midJugyo2 + t.midMiddle + t.midAdult;
                        return (
                          <tr key={t.sortOrder} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-2 py-1 text-center">{t.sortOrder}</td>
                            <td className="border border-gray-300 px-2 py-1">{t.className}</td>
                            <td className="border border-gray-300 px-2 py-1">{t.teacherName}</td>
                            <td className="border border-gray-300 px-2 py-1 text-center">{t.jugyo}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{t.midJugyo1}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{t.midJugyo2}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{t.midMiddle}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{t.midAdult}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-orange-50/50">{cur}</td>
                            <td className="border border-gray-300 px-1 py-1 text-center">{t.jugyoAfternoon}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!singleData.weekly && singleData.districts.length === 0 && singleData.teachers.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">이 일자의 전체출석보고가 없습니다.</div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "range" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap print:hidden">
            <label className="text-sm text-gray-600">기간</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            <span className="text-gray-400">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            <button
              onClick={loadRange}
              disabled={loading}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "로딩..." : "집계"}
            </button>
            <span className="text-xs text-gray-500 ml-auto">{rangeData.length} 일자</span>
          </div>

          {!loading && rangeData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-1 sticky left-0 bg-gray-100">일자</th>
                    <th className="border border-gray-300 px-1 py-1">삼일</th>
                    <th className="border border-gray-300 px-1 py-1">오일</th>
                    <th className="border border-gray-300 px-1 py-1 bg-blue-50">주오<br/>장년</th>
                    <th className="border border-gray-300 px-1 py-1 bg-blue-50">주오<br/>중간</th>
                    <th className="border border-gray-300 px-1 py-1 bg-blue-50">계</th>
                    <th className="border border-gray-300 px-1 py-1 bg-green-50">주후<br/>장년</th>
                    <th className="border border-gray-300 px-1 py-1 bg-green-50">주후<br/>중간</th>
                    <th className="border border-gray-300 px-1 py-1 bg-green-50">계</th>
                    <th className="border border-gray-300 px-1 py-1">주교</th>
                    <th className="border border-gray-300 px-1 py-1">중예</th>
                    <th className="border border-gray-300 px-1 py-1">새벽</th>
                    <th className="border border-gray-300 px-1 py-1 bg-purple-50">성경</th>
                    <th className="border border-gray-300 px-1 py-1">기도</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeData.map((r) => {
                    const w = r.weekly;
                    const d = r.district?._sum;
                    return (
                      <tr key={r.date} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-2 py-1 font-mono sticky left-0 bg-white">{r.date}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.sam ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.oh ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.amAdult ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.amMid ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-blue-50/50">
                          {w ? w.amAdult + w.amMid : ""}
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.pmAdult ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.pmMid ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-green-50/50">
                          {w ? w.pmAdult + w.pmMid : ""}
                        </td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.jugyo ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.midService ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{w?.dawn ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center bg-purple-50/50">{d?.bibleMale ?? ""}</td>
                        <td className="border border-gray-300 px-1 py-1 text-center">{d?.prayer ?? ""}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-yellow-100 font-bold">
                    <td className="border border-gray-300 px-2 py-1 text-center sticky left-0 bg-yellow-100">기간 합계</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.sam}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.oh}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.amAdult}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.amMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center bg-blue-100/50">{rangeTotals.amAdult + rangeTotals.amMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.pmAdult}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.pmMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center bg-green-100/50">{rangeTotals.pmAdult + rangeTotals.pmMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.jugyo}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.midService}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.dawn}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center bg-purple-100/50">{rangeTotals.bible}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{rangeTotals.prayer}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {!loading && rangeData.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">이 기간에 데이터가 없습니다.</div>
          )}
        </div>
      )}
    </div>
  );
}
