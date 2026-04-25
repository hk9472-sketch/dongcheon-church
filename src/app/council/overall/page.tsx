"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { handleArrowNav } from "@/lib/useArrowNav";
import HelpButton from "@/components/HelpButton";
import FloppyIcon from "@/components/icons/FloppyIcon";

interface DistrictRow {
  groupId: number;
  groupName: string;
  adultSam: number; adultOh: number; adultJupre: number; adultJuhu: number;
  midSam: number; midOh: number; midJupre: number; midJuhu: number;
  bibleMale: number; bibleFemale: number; prayer: number;
  prevAdultJupre: number; prevMidJupre: number; prevGrandTotal: number;
}

interface TeacherRow {
  teacherName: string;
  className: string;
  sortOrder: number;
  jugyo: number;
  midJugyo1: number; midJugyo2: number; midMiddle: number; midAdult: number;
  jugyoAfternoon: number;
  prevTotal: number;
}

interface SummaryData {
  sam: number; oh: number;
  amAdult: number; amMid: number;
  pmAdult: number; pmMid: number;
  jugyo: number; midService: number; dawn: number;
  maleBible: number; femaleBible: number;
  afternoonSermon: string;
  prevSam: number; prevOh: number;
  prevAmAdult: number; prevAmMid: number;
  prevPmAdult: number; prevPmMid: number;
  prevJugyo: number; prevMidService: number; prevDawn: number;
}

interface AttachedFile {
  id: number;
  origName: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

type Tab = "district" | "teacher";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function downloadExcel(filename: string) {
  const tables = document.querySelectorAll("table");
  if (!tables.length) return;
  let html = "";
  tables.forEach((t) => { html += t.outerHTML + "<br/>"; });
  const full = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>td,th{border:1px solid #999;padding:2px 5px;text-align:center;font-size:11px;} th{background:#f0f0f0;font-weight:bold;}</style></head><body>${html}</body></html>`;
  const blob = new Blob(["\uFEFF" + full], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function OverallPage() {
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState<Tab>("district");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [prevTeacherList, setPrevTeacherList] = useState<{ teacherName: string; className: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/council/overall?date=${date}`);
      const data = await res.json();
      setSummary(data.summary || null);
      setDistricts(data.districtData || []);
      setTeachers(data.teacherData || []);
      setPrevTeacherList(data.prevTeacherList || []);
      // 첨부파일 로드
      const fRes = await fetch(`/api/council/files?category=overall&date=${date}`);
      if (fRes.ok) setFiles(await fRes.json());
    } catch {
      setMessage("데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  // 파일 업로드
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("category", "overall");
    formData.append("date", date);
    for (let i = 0; i < fileList.length; i++) {
      formData.append("files", fileList[i]);
    }
    try {
      const res = await fetch("/api/council/files", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setFiles((prev) => [...data.files, ...prev]);
        setMessage(`${data.files.length}개 파일 업로드 완료`);
      } else {
        const err = await res.json();
        setMessage(err.message || "업로드 실패");
      }
    } catch { setMessage("업로드 오류"); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setMessage(""), 3000);
    }
  };

  // 파일 삭제
  const handleFileDelete = async (fileId: number, name: string) => {
    if (!confirm(`"${name}" 파일을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/council/files?id=${fileId}`, { method: "DELETE" });
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  // 파일 크기 포맷
  const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;

  const updateDistrict = (idx: number, field: keyof DistrictRow, val: number) => {
    setDistricts((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const updateTeacher = (idx: number, field: keyof TeacherRow, val: number | string) => {
    setTeachers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const addTeacher = () => {
    setTeachers((prev) => [...prev, {
      teacherName: "", className: "", sortOrder: prev.length + 1, jugyo: 0,
      midJugyo1: 0, midJugyo2: 0, midMiddle: 0, midAdult: 0,
      jugyoAfternoon: 0, prevTotal: 0,
    }]);
  };

  const loadPrevTeachers = () => {
    if (prevTeacherList.length === 0) {
      setMessage("전주 반사 명단이 없습니다.");
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    setTeachers(prevTeacherList.map((t, i) => ({
      teacherName: t.teacherName, className: t.className || "", sortOrder: i + 1, jugyo: 0,
      midJugyo1: 0, midJugyo2: 0, midMiddle: 0, midAdult: 0,
      jugyoAfternoon: 0, prevTotal: 0,
    })));
    setMessage("전주 반사 명단을 불러왔습니다.");
    setTimeout(() => setMessage(""), 2000);
  };

  const updateSummary = (field: keyof SummaryData, val: number | string) => {
    setSummary((prev) => prev ? { ...prev, [field]: val } : prev);
  };

  const handleSave = async () => {
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/council/overall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, summary, districtData: districts, teacherData: teachers }),
      });
      if (res.ok) {
        setMessage("저장되었습니다.");
      } else {
        const err = await res.json();
        setMessage(err.message || "저장 실패");
      }
    } catch { setMessage("저장 오류"); }
    finally { setSaving(false); setTimeout(() => setMessage(""), 3000); }
  };

  // 구역별 합계 계산 (장년반 계=삼일+오일+주전+주후)
  const adultTotal = (d: DistrictRow) => d.adultSam + d.adultOh + d.adultJupre + d.adultJuhu;
  const midTotal = (d: DistrictRow) => d.midSam + d.midOh + d.midJupre + d.midJuhu;
  const grandCurrent = (d: DistrictRow) => adultTotal(d) + midTotal(d);

  const districtTotals = {
    adultSam: districts.reduce((s, d) => s + d.adultSam, 0),
    adultOh: districts.reduce((s, d) => s + d.adultOh, 0),
    adultJupre: districts.reduce((s, d) => s + d.adultJupre, 0),
    adultJuhu: districts.reduce((s, d) => s + d.adultJuhu, 0),
    midSam: districts.reduce((s, d) => s + d.midSam, 0),
    midOh: districts.reduce((s, d) => s + d.midOh, 0),
    midJupre: districts.reduce((s, d) => s + d.midJupre, 0),
    midJuhu: districts.reduce((s, d) => s + d.midJuhu, 0),
    bibleMale: districts.reduce((s, d) => s + d.bibleMale, 0),
    bibleFemale: districts.reduce((s, d) => s + d.bibleFemale, 0),
    prayer: districts.reduce((s, d) => s + d.prayer, 0),
    prevAdultJupre: districts.reduce((s, d) => s + d.prevAdultJupre, 0),
    prevMidJupre: districts.reduce((s, d) => s + d.prevMidJupre, 0),
    prevGrandTotal: districts.reduce((s, d) => s + d.prevGrandTotal, 0),
  };
  const districtAdultTotalAll = districtTotals.adultSam + districtTotals.adultOh + districtTotals.adultJupre + districtTotals.adultJuhu;
  const districtMidTotalAll = districtTotals.midSam + districtTotals.midOh + districtTotals.midJupre + districtTotals.midJuhu;

  // 반사별 합계
  const teacherTotals = {
    jugyo: teachers.reduce((s, t) => s + t.jugyo, 0),
    midJugyo1: teachers.reduce((s, t) => s + t.midJugyo1, 0),
    midJugyo2: teachers.reduce((s, t) => s + t.midJugyo2, 0),
    midMiddle: teachers.reduce((s, t) => s + t.midMiddle, 0),
    midAdult: teachers.reduce((s, t) => s + t.midAdult, 0),
    jugyoAfternoon: teachers.reduce((s, t) => s + t.jugyoAfternoon, 0),
    prevTotal: teachers.reduce((s, t) => s + t.prevTotal, 0),
  };
  const teacherCurrentTotal = (t: TeacherRow) => t.jugyo + t.midJugyo1 + t.midJugyo2 + t.midMiddle + t.midAdult;

  const inputCls = "w-full text-center py-0.5 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex flex-wrap gap-3 items-center justify-between mb-3">
          <h1 className="text-base font-bold text-gray-800 flex items-center gap-2">전체출석보고 <HelpButton slug="council-overall" /></h1>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm" />
            <button onClick={loadData} disabled={loading}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50">
              {loading ? "로딩..." : "조회"}
            </button>
            <button onClick={() => window.print()} className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 print:hidden">
              인쇄
            </button>
            <button onClick={() => downloadExcel(`전체출석보고_${date}.xls`)}
              className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 print:hidden">
              엑셀
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 전체출석요약 */}
        {summary && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-2">전체출석보고</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse print:text-[10px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 w-14">구분</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 w-10">삼일</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 w-10">오일</th>
                    <th colSpan={3} className="border border-gray-300 px-1 py-1 bg-blue-50">주일오전</th>
                    <th colSpan={3} className="border border-gray-300 px-1 py-1 bg-green-50">주일오후</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 w-10">주교</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 w-14">중간반<br/>(예배)</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 w-10">새벽</th>
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-1 py-1 bg-blue-50 w-12">장년반</th>
                    <th className="border border-gray-300 px-1 py-1 bg-blue-50 w-12">중간반</th>
                    <th className="border border-gray-300 px-1 py-1 bg-blue-50 w-10">계</th>
                    <th className="border border-gray-300 px-1 py-1 bg-green-50 w-12">장년반</th>
                    <th className="border border-gray-300 px-1 py-1 bg-green-50 w-12">중간반</th>
                    <th className="border border-gray-300 px-1 py-1 bg-green-50 w-10">계</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 금주 */}
                  <tr>
                    <td className="border border-gray-300 px-2 py-1 font-bold text-center">금주</td>
                    {(["sam", "oh"] as const).map((k, ci) => (
                      <td key={k} className="border border-gray-300 px-0 py-0">
                        <input type="number" min={0} data-row={0} data-col={ci} onKeyDown={handleArrowNav} value={summary[k]} onChange={(e) => updateSummary(k, Number(e.target.value) || 0)} className={inputCls} />
                      </td>
                    ))}
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={0} data-col={2} onKeyDown={handleArrowNav} value={summary.amAdult} onChange={(e) => updateSummary("amAdult", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={0} data-col={3} onKeyDown={handleArrowNav} value={summary.amMid} onChange={(e) => updateSummary("amMid", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-blue-50/50">{summary.amAdult + summary.amMid}</td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={0} data-col={4} onKeyDown={handleArrowNav} value={summary.pmAdult} onChange={(e) => updateSummary("pmAdult", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={0} data-col={5} onKeyDown={handleArrowNav} value={summary.pmMid} onChange={(e) => updateSummary("pmMid", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-green-50/50">{summary.pmAdult + summary.pmMid}</td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={0} data-col={6} onKeyDown={handleArrowNav} value={summary.jugyo} onChange={(e) => updateSummary("jugyo", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={0} data-col={7} onKeyDown={handleArrowNav} value={summary.midService} onChange={(e) => updateSummary("midService", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={0} data-col={8} onKeyDown={handleArrowNav} value={summary.dawn} onChange={(e) => updateSummary("dawn", Number(e.target.value) || 0)} className={inputCls} /></td>
                  </tr>
                  {/* 전주 */}
                  <tr className="bg-gray-50">
                    <td className="border border-gray-300 px-2 py-1 font-bold text-center">전주</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevSam}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevOh}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevAmAdult}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevAmMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-blue-50/50">{summary.prevAmAdult + summary.prevAmMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevPmAdult}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevPmMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-green-50/50">{summary.prevPmAdult + summary.prevPmMid}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevJugyo}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevMidService}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center">{summary.prevDawn}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 남반/여반 성경 — 분리된 작은 테이블 */}
            <div className="mt-2">
              <table className="text-xs border-collapse">
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-3 py-1 text-center bg-gray-50 font-bold w-20">남반 성경</td>
                    <td className="border border-gray-300 px-0 py-0 w-16">
                      <input type="number" min={0} value={summary.maleBible} onChange={(e) => updateSummary("maleBible", Number(e.target.value) || 0)}
                        className="w-full text-center py-0.5 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300" />
                    </td>
                    <td className="border border-gray-300 px-3 py-1 text-center bg-gray-50 font-bold w-20">여반 성경</td>
                    <td className="border border-gray-300 px-0 py-0 w-16">
                      <input type="number" min={0} value={summary.femaleBible} onChange={(e) => updateSummary("femaleBible", Number(e.target.value) || 0)}
                        className="w-full text-center py-0.5 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 탭: 구역별 / 반사별 */}
        <div className="flex border-b border-gray-200 print:hidden">
          <button onClick={() => setTab("district")}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "district" ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500"}`}>
            구역별성적
          </button>
          <button onClick={() => setTab("teacher")}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "teacher" ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500"}`}>
            반사별성적
          </button>
        </div>

        {/* 구역별성적 */}
        {tab === "district" && (
          <div className="overflow-x-auto">
            <h2 className="text-sm font-bold text-gray-700 mb-2">구역별 성적</h2>
            <table className="w-full text-xs border-collapse print:text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th rowSpan={3} className="border border-gray-300 px-2 py-1 w-16">구역</th>
                  <th colSpan={6} className="border border-gray-300 px-1 py-1 bg-blue-50">장년반</th>
                  <th colSpan={6} className="border border-gray-300 px-1 py-1 bg-green-50">중간반</th>
                  <th colSpan={2} className="border border-gray-300 px-1 py-1 bg-orange-50">총계</th>
                  <th colSpan={3} className="border border-gray-300 px-1 py-1 bg-purple-50">성경</th>
                  <th rowSpan={3} className="border border-gray-300 px-1 py-1 w-10">기도</th>
                </tr>
                <tr className="bg-gray-50">
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-blue-50 w-10">삼일</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-blue-50 w-10">오일</th>
                  <th colSpan={2} className="border border-gray-300 px-1 py-1 bg-blue-50">주전</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-blue-50 w-10">주후</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-blue-50 w-10">계</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50 w-10">삼일</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50 w-10">오일</th>
                  <th colSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50">주전</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50 w-10">주후</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50 w-10">계</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-orange-50 w-10">전주</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-orange-50 w-10">금주</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-purple-50 w-10">남</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-purple-50 w-10">여</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-purple-50 w-10">합계</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-1 py-0.5 bg-blue-50 text-[10px] w-10">전주</th>
                  <th className="border border-gray-300 px-1 py-0.5 bg-blue-50 text-[10px] w-10">금주</th>
                  <th className="border border-gray-300 px-1 py-0.5 bg-green-50 text-[10px] w-10">전주</th>
                  <th className="border border-gray-300 px-1 py-0.5 bg-green-50 text-[10px] w-10">금주</th>
                </tr>
              </thead>
              <tbody>
                {districts.map((d, i) => {
                  const aTotal = adultTotal(d);
                  const mTotal = midTotal(d);
                  const gc = grandCurrent(d);
                  const bibleTotal = d.bibleMale + d.bibleFemale;
                  return (
                    <tr key={d.groupId} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1 text-center font-medium">{d.groupName}</td>
                      {/* 장년반 */}
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={0} onKeyDown={handleArrowNav} value={d.adultSam} onChange={(e) => updateDistrict(i, "adultSam", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={1} onKeyDown={handleArrowNav} value={d.adultOh} onChange={(e) => updateDistrict(i, "adultOh", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-1 py-1 text-center text-gray-400">{d.prevAdultJupre}</td>
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={2} onKeyDown={handleArrowNav} value={d.adultJupre} onChange={(e) => updateDistrict(i, "adultJupre", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={3} onKeyDown={handleArrowNav} value={d.adultJuhu} onChange={(e) => updateDistrict(i, "adultJuhu", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-blue-50/50">{aTotal}</td>
                      {/* 중간반 */}
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={4} onKeyDown={handleArrowNav} value={d.midSam} onChange={(e) => updateDistrict(i, "midSam", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={5} onKeyDown={handleArrowNav} value={d.midOh} onChange={(e) => updateDistrict(i, "midOh", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-1 py-1 text-center text-gray-400">{d.prevMidJupre}</td>
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={6} onKeyDown={handleArrowNav} value={d.midJupre} onChange={(e) => updateDistrict(i, "midJupre", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={7} onKeyDown={handleArrowNav} value={d.midJuhu} onChange={(e) => updateDistrict(i, "midJuhu", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-green-50/50">{mTotal}</td>
                      {/* 총계 */}
                      <td className="border border-gray-300 px-1 py-1 text-center text-gray-400">{d.prevGrandTotal}</td>
                      <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-orange-50/50">{gc}</td>
                      {/* 성경(남/여/합계) */}
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={8} onKeyDown={handleArrowNav} value={d.bibleMale} onChange={(e) => updateDistrict(i, "bibleMale", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={9} onKeyDown={handleArrowNav} value={d.bibleFemale} onChange={(e) => updateDistrict(i, "bibleFemale", Number(e.target.value) || 0)} className={inputCls} /></td>
                      <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-purple-50/50">{bibleTotal}</td>
                      {/* 기도 */}
                      <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} data-row={i} data-col={10} onKeyDown={handleArrowNav} value={d.prayer} onChange={(e) => updateDistrict(i, "prayer", Number(e.target.value) || 0)} className={inputCls} /></td>
                    </tr>
                  );
                })}
                {/* 합계 */}
                <tr className="bg-yellow-50 font-bold">
                  <td className="border border-gray-300 px-2 py-1 text-center">계</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultSam}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultOh}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.prevAdultJupre}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultJupre}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.adultJuhu}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center bg-blue-100/50">{districtAdultTotalAll}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midSam}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midOh}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.prevMidJupre}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midJupre}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.midJuhu}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center bg-green-100/50">{districtMidTotalAll}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.prevGrandTotal}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center bg-orange-100/50">{districtAdultTotalAll + districtMidTotalAll}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.bibleMale}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.bibleFemale}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center bg-purple-100/50">{districtTotals.bibleMale + districtTotals.bibleFemale}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{districtTotals.prayer}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* 반사별성적 */}
        {tab === "teacher" && (
          <div className="overflow-x-auto">
            <h2 className="text-sm font-bold text-gray-700 mb-2">반사별 성적</h2>
            <table className="w-full text-xs border-collapse print:text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th rowSpan={3} className="border border-gray-300 px-1 py-1 w-10">순서</th>
                  <th rowSpan={3} className="border border-gray-300 px-1 py-1 w-16">반</th>
                  <th rowSpan={3} className="border border-gray-300 px-1 py-1 w-16">반사</th>
                  <th rowSpan={3} className="border border-gray-300 px-1 py-1 w-10">주교</th>
                  <th colSpan={4} className="border border-gray-300 px-1 py-1 bg-green-50">중간반</th>
                  <th colSpan={2} className="border border-gray-300 px-1 py-1 bg-orange-50">총계</th>
                  <th rowSpan={3} className="border border-gray-300 px-1 py-1 w-14">주교<br/>오후</th>
                  <th rowSpan={3} className="border border-gray-300 px-1 py-1 w-8 print:hidden">삭</th>
                </tr>
                <tr className="bg-gray-50">
                  <th colSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50">주교</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50 w-10">중간</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-green-50 w-10">장년</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-orange-50 w-10">전주</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 bg-orange-50 w-10">금주</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-1 py-1 bg-green-50 w-10">중1</th>
                  <th className="border border-gray-300 px-1 py-1 bg-green-50 w-10">중2</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-0 py-0">
                      <input type="number" min={0} value={t.sortOrder} onChange={(e) => updateTeacher(i, "sortOrder", Number(e.target.value) || 0)}
                        className="w-full text-center py-0.5 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300" />
                    </td>
                    <td className="border border-gray-300 px-0 py-0">
                      <input type="text" value={t.className} onChange={(e) => updateTeacher(i, "className", e.target.value)}
                        className="w-full px-1 py-0.5 text-xs border-0 bg-transparent text-center focus:ring-1 focus:ring-indigo-300" />
                    </td>
                    <td className="border border-gray-300 px-0 py-0">
                      <input type="text" value={t.teacherName} onChange={(e) => updateTeacher(i, "teacherName", e.target.value)}
                        className="w-full px-1 py-0.5 text-xs border-0 bg-transparent text-center focus:ring-1 focus:ring-indigo-300" />
                    </td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} value={t.jugyo} onChange={(e) => updateTeacher(i, "jugyo", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} value={t.midJugyo1} onChange={(e) => updateTeacher(i, "midJugyo1", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} value={t.midJugyo2} onChange={(e) => updateTeacher(i, "midJugyo2", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} value={t.midMiddle} onChange={(e) => updateTeacher(i, "midMiddle", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} value={t.midAdult} onChange={(e) => updateTeacher(i, "midAdult", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-1 py-1 text-center text-gray-400">{t.prevTotal}</td>
                    <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-orange-50/50">{teacherCurrentTotal(t)}</td>
                    <td className="border border-gray-300 px-0 py-0"><input type="number" min={0} value={t.jugyoAfternoon} onChange={(e) => updateTeacher(i, "jugyoAfternoon", Number(e.target.value) || 0)} className={inputCls} /></td>
                    <td className="border border-gray-300 px-0 py-0 text-center print:hidden">
                      <button onClick={() => setTeachers((prev) => prev.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-[10px]">✕</button>
                    </td>
                  </tr>
                ))}
                {/* 합계 */}
                <tr className="bg-yellow-50 font-bold">
                  <td colSpan={3} className="border border-gray-300 px-2 py-1 text-center">계</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{teacherTotals.jugyo}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{teacherTotals.midJugyo1}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{teacherTotals.midJugyo2}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{teacherTotals.midMiddle}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{teacherTotals.midAdult}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{teacherTotals.prevTotal}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center bg-orange-100/50">
                    {teacherTotals.jugyo + teacherTotals.midJugyo1 + teacherTotals.midJugyo2 + teacherTotals.midMiddle + teacherTotals.midAdult}
                  </td>
                  <td className="border border-gray-300 px-1 py-1 text-center">{teacherTotals.jugyoAfternoon}</td>
                  <td className="border border-gray-300 print:hidden"></td>
                </tr>
              </tbody>
            </table>
            <div className="mt-2 flex items-center gap-3 print:hidden">
              <button onClick={addTeacher}
                className="px-3 py-1 text-xs bg-gray-100 text-gray-600 border border-gray-300 rounded hover:bg-gray-200">
                반사 추가
              </button>
              <button onClick={loadPrevTeachers}
                className="px-3 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-300 rounded hover:bg-amber-100">
                전주 명단 불러오기
              </button>
              {summary && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <label className="text-xs text-gray-600 font-medium">오후설교:</label>
                  <input
                    type="text"
                    value={summary.afternoonSermon || ""}
                    onChange={(e) => updateSummary("afternoonSermon", e.target.value)}
                    placeholder="오후 설교 내용"
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-48 focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 첨부파일 */}
      <div className="px-4 py-3 border-t border-gray-200 print:hidden">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">
            첨부파일
            {files.length > 0 && <span className="text-gray-400 font-normal ml-1">({files.length})</span>}
          </h3>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx,.xls,.pdf,.doc,.docx,.hwp,.jpg,.jpeg,.png,.zip"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : "파일 추가"}
            </button>
          </div>
        </div>
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f) => {
              const isExcel = /\.(xlsx?|csv)$/i.test(f.origName);
              return (
                <div key={f.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-3 py-1.5 border border-gray-200">
                  {isExcel ? (
                    <span className="shrink-0 text-green-600">📊</span>
                  ) : (
                    <FloppyIcon className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                  <a
                    href={`/api/council/files/download?id=${f.id}`}
                    className="text-indigo-600 hover:underline truncate flex-1"
                    title={f.origName}
                  >
                    {f.origName}
                  </a>
                  <span className="text-gray-400 shrink-0">{fmtSize(f.fileSize)}</span>
                  <button
                    onClick={() => handleFileDelete(f.id, f.origName)}
                    className="text-red-400 hover:text-red-600 shrink-0"
                  >
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {files.length === 0 && (
          <p className="text-xs text-gray-400">첨부된 파일이 없습니다. 엑셀 양식 등을 업로드할 수 있습니다.</p>
        )}
      </div>

      {/* 저장 */}
      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between print:hidden">
        {message && (
          <span className={`text-sm ${message.includes("실패") || message.includes("오류") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </span>
        )}
        <div className="ml-auto">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
