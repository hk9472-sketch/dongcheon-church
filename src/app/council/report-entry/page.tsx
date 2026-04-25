"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { handleArrowNav } from "@/lib/useArrowNav";
import HelpButton from "@/components/HelpButton";
import FloppyIcon from "@/components/icons/FloppyIcon";

interface AttachedFile {
  id: number;
  origName: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

interface GroupInfo {
  id: number;
  name: string;
}

interface ReportRow {
  division: string;
  memberName: string;
  isMale: boolean;
  sam: number;
  oh: number;
  jupre: number;
  juhu: number;
  bible: number;
  prayer: number;
  toDelete: boolean;
}

const COLS = ["삼일", "오일", "주전", "주후"] as const;
const COL_KEYS = ["sam", "oh", "jupre", "juhu"] as const;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyRow(division: string, memberName = "", isMale = false): ReportRow {
  return { division, memberName, isMale, sam: 0, oh: 0, jupre: 0, juhu: 0, bible: 0, prayer: 0, toDelete: false };
}

function rowSum(row: ReportRow) {
  return row.sam + row.oh + row.jupre + row.juhu;
}

export default function ReportEntryPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number>(0);
  const [date, setDate] = useState(todayStr());
  const [adultRows, setAdultRows] = useState<ReportRow[]>([]);
  const [midRows, setMidRows] = useState<ReportRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 구역 목록 로드 (사용자 접근 가능 구역만)
  useEffect(() => {
    Promise.all([
      fetch("/api/council/depts").then((r) => r.json()),
      fetch("/api/council/my-groups").then((r) => r.json()),
    ])
      .then(([depts, access]) => {
        if (!Array.isArray(depts)) return;
        const allGroups: GroupInfo[] = [];
        for (const dept of depts) {
          if (dept.groups && Array.isArray(dept.groups)) {
            for (const g of dept.groups) {
              allGroups.push({ id: g.id, name: g.name });
            }
          }
        }
        // 관리자가 아니면 허가된 구역만 표시
        const filtered = access.isAdmin
          ? allGroups
          : allGroups.filter((g) => (access.groupIds as number[]).includes(g.id));
        setGroups(filtered);
        if (filtered.length > 0) setSelectedGroupId(filtered[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!selectedGroupId || !date) {
      setAdultRows([emptyRow("장년")]);
      setMidRows([emptyRow("중간")]);
      return;
    }

    const res = await fetch(`/api/council/report-entry?groupId=${selectedGroupId}&date=${date}`);
    const entries = await res.json();

    if (Array.isArray(entries) && entries.length > 0) {
      const adults = entries
        .filter((e: { division: string }) => e.division === "장년")
        .map((e: Record<string, unknown>) => ({
          division: "장년",
          memberName: (e.memberName as string) || "",
          isMale: (e.isMale as boolean) ?? false,
          sam: e.sam as number, oh: e.oh as number, jupre: e.jupre as number,
          juhu: e.juhu as number, bible: e.bible as number, prayer: e.prayer as number,
          toDelete: false,
        }));
      const mids = entries
        .filter((e: { division: string }) => e.division === "중간")
        .map((e: Record<string, unknown>) => ({
          division: "중간",
          memberName: (e.memberName as string) || "",
          isMale: (e.isMale as boolean) ?? false,
          sam: e.sam as number, oh: e.oh as number, jupre: e.jupre as number,
          juhu: e.juhu as number, bible: e.bible as number, prayer: e.prayer as number,
          toDelete: false,
        }));
      setAdultRows(adults.length > 0 ? adults : [emptyRow("장년")]);
      setMidRows(mids.length > 0 ? mids : [emptyRow("중간")]);
    } else {
      const makeRows = (div: string) => {
        const rows: ReportRow[] = [];
        for (let i = 0; i < 20; i++) rows.push(emptyRow(div));
        rows.push(emptyRow(div, "")); // 합계 행
        return rows;
      };
      setAdultRows(makeRows("장년"));
      setMidRows(makeRows("중간"));
    }

    // 첨부파일 로드
    try {
      const fRes = await fetch(`/api/council/files?category=report-entry&date=${date}&groupId=${selectedGroupId}`);
      if (fRes.ok) setFiles(await fRes.json());
      else setFiles([]);
    } catch { setFiles([]); }
  }, [selectedGroupId, date]);

  useEffect(() => { loadData(); }, [loadData]);

  // 파일 업로드
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !selectedGroupId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("category", "report-entry");
    formData.append("date", date);
    formData.append("groupId", String(selectedGroupId));
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
    if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;

  const updateRow = (div: "adult" | "mid", idx: number, field: keyof ReportRow, value: number | string | boolean) => {
    const setter = div === "adult" ? setAdultRows : setMidRows;
    setter((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addRow = (div: "adult" | "mid") => {
    const setter = div === "adult" ? setAdultRows : setMidRows;
    const division = div === "adult" ? "장년" : "중간";
    setter((prev) => {
      const newRow = emptyRow(division);
      const lastIdx = prev.length - 1;
      if (lastIdx >= 0 && !prev[lastIdx].memberName.trim()) {
        return [...prev.slice(0, lastIdx), newRow, prev[lastIdx]];
      }
      return [...prev, newRow];
    });
  };

  // 이전 명단 불러오기
  const loadPrevious = async (div: "adult" | "mid") => {
    if (!selectedGroupId) return;
    const division = div === "adult" ? "장년" : "중간";
    const res = await fetch(`/api/council/report-entry/previous-names?groupId=${selectedGroupId}&division=${division}`);
    const data = await res.json();
    if (data.names && data.names.length > 0) {
      const setter = div === "adult" ? setAdultRows : setMidRows;
      const rows: ReportRow[] = data.names.map((item: { name: string; isMale: boolean }) =>
        emptyRow(division, item.name, item.isMale)
      );
      rows.push(emptyRow(division, "")); // 합계 행
      setter(rows);
      setMessage(`${data.date || ""} ${division}반 명단을 불러왔습니다.`);
      setTimeout(() => setMessage(""), 2000);
    } else {
      setMessage(`이전 ${division}반 명단이 없습니다.`);
      setTimeout(() => setMessage(""), 2000);
    }
  };

  // 저장
  const handleSave = async () => {
    if (!selectedGroupId || !date) return;
    setSaving(true);
    setMessage("");

    // 빈 행 제거: 이름이 없고 모든 값이 0인 행은 저장에서 제외
    const isEmptyRow = (r: ReportRow) =>
      !r.memberName.trim() && r.sam === 0 && r.oh === 0 && r.jupre === 0 && r.juhu === 0 && r.bible === 0 && r.prayer === 0;

    const allRows = [
      ...adultRows.filter((r) => !r.toDelete && !isEmptyRow(r)),
      ...midRows.filter((r) => !r.toDelete && !isEmptyRow(r)),
    ];

    try {
      const res = await fetch("/api/council/report-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: selectedGroupId,
          date,
          rows: allRows.map((r) => ({
            division: r.division,
            memberName: r.memberName.trim() || null,
            isMale: r.isMale,
            sam: r.sam, oh: r.oh, jupre: r.jupre, juhu: r.juhu, bible: r.bible, prayer: r.prayer,
          })),
        }),
      });

      if (res.ok) {
        setMessage("저장되었습니다.");
        // 삭제 및 빈 행 정리
        setAdultRows((prev) => {
          const kept = prev.filter((r) => !r.toDelete && !isEmptyRow(r));
          return kept.length > 0 ? kept : [emptyRow("장년")];
        });
        setMidRows((prev) => {
          const kept = prev.filter((r) => !r.toDelete && !isEmptyRow(r));
          return kept.length > 0 ? kept : [emptyRow("중간")];
        });
      } else {
        const err = await res.json();
        setMessage(err.message || "저장 실패");
      }
    } catch {
      setMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  // 컬럼 합계 계산
  const colTotals = (rows: ReportRow[]) => {
    const totals = { sam: 0, oh: 0, jupre: 0, juhu: 0, bible: 0, prayer: 0 };
    for (const r of rows) {
      if (r.toDelete || !r.memberName.trim()) continue;
      totals.sam += r.sam; totals.oh += r.oh; totals.jupre += r.jupre;
      totals.juhu += r.juhu; totals.bible += r.bible; totals.prayer += r.prayer;
    }
    return totals;
  };

  if (loading) return <div className="py-12 text-center text-gray-400">로딩 중...</div>;

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // 반 테이블 렌더
  const renderTable = (
    divKey: "adult" | "mid",
    label: string,
    rows: ReportRow[],
    bgClass: string,
  ) => {
    const totals = colTotals(rows);
    const attendTotal = totals.sam + totals.oh + totals.jupre + totals.juhu;

    return (
      <div className="flex-1 min-w-0">
        <div className={`flex items-center justify-between px-3 py-1.5 ${bgClass} border-b border-gray-300`}>
          <span className="text-xs font-bold text-gray-700">{label}</span>
          <button
            onClick={() => loadPrevious(divKey)}
            className="px-2 py-0.5 text-[10px] bg-white/80 text-amber-700 border border-amber-300 rounded hover:bg-amber-50"
          >
            이전명단
          </button>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-1 py-1 w-7 text-center">번호</th>
              <th className="border border-gray-300 px-1 py-1 w-14 text-center">이름</th>
              <th className="border border-gray-300 px-1 py-1 w-6 text-center">남</th>
              {COLS.map((c) => (
                <th key={c} className="border border-gray-300 px-1 py-1 w-9 text-center">{c}</th>
              ))}
              <th className="border border-gray-300 px-1 py-1 w-9 text-center bg-yellow-50">합계</th>
              <th className="border border-gray-300 px-1 py-1 w-9 text-center">성경</th>
              <th className="border border-gray-300 px-1 py-1 w-9 text-center">기도</th>
              <th className="border border-gray-300 px-1 py-1 w-6 text-center">삭</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isAgg = !row.memberName.trim() && idx === rows.length - 1;
              return (
                <tr key={idx} className={`${row.toDelete ? "bg-red-50 opacity-50" : isAgg ? "bg-yellow-50 font-bold" : "hover:bg-gray-50"}`}>
                  <td className="border border-gray-300 px-1 py-0 text-center text-[10px] text-gray-400">
                    {isAgg ? "" : idx + 1}
                  </td>
                  <td className="border border-gray-300 px-0 py-0">
                    <input
                      type="text"
                      data-row={idx} data-col={-1}
                      onKeyDown={handleArrowNav}
                      value={row.memberName}
                      onChange={(e) => updateRow(divKey, idx, "memberName", e.target.value)}
                      className={`w-full px-1 py-0.5 text-xs border-0 bg-transparent text-center focus:ring-1 focus:ring-indigo-300 ${isAgg ? "placeholder:text-yellow-600 font-bold" : ""}`}
                      placeholder={isAgg ? "계" : ""}
                    />
                  </td>
                  <td className="border border-gray-300 px-0 py-0 text-center">
                    {!isAgg && (
                      <input
                        type="checkbox"
                        checked={row.isMale}
                        onChange={(e) => updateRow(divKey, idx, "isMale", e.target.checked)}
                        className="w-3 h-3 accent-blue-600"
                      />
                    )}
                  </td>
                  {COL_KEYS.map((k, ci) => (
                    <td key={k} className="border border-gray-300 px-0 py-0 text-center">
                      <input
                        type="number" min={0}
                        data-row={idx} data-col={ci}
                        onKeyDown={handleArrowNav}
                        value={row[k]}
                        onChange={(e) => updateRow(divKey, idx, k, Number(e.target.value) || 0)}
                        className="w-full text-center py-0.5 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300"
                      />
                    </td>
                  ))}
                  <td className="border border-gray-300 px-1 py-0.5 text-center bg-yellow-50/50">
                    {rowSum(row)}
                  </td>
                  <td className="border border-gray-300 px-0 py-0 text-center">
                    <input
                      type="number" min={0}
                      data-row={idx} data-col={COL_KEYS.length}
                      onKeyDown={handleArrowNav}
                      value={row.bible}
                      onChange={(e) => updateRow(divKey, idx, "bible", Number(e.target.value) || 0)}
                      className="w-full text-center py-0.5 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300"
                    />
                  </td>
                  <td className="border border-gray-300 px-0 py-0 text-center">
                    <input
                      type="number" min={0}
                      data-row={idx} data-col={COL_KEYS.length + 1}
                      onKeyDown={handleArrowNav}
                      value={row.prayer}
                      onChange={(e) => updateRow(divKey, idx, "prayer", Number(e.target.value) || 0)}
                      className="w-full text-center py-0.5 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300"
                    />
                  </td>
                  <td className="border border-gray-300 px-0 py-0 text-center">
                    {!isAgg && (
                      <input
                        type="checkbox"
                        checked={row.toDelete}
                        onChange={(e) => updateRow(divKey, idx, "toDelete", e.target.checked)}
                        className="w-3 h-3 accent-red-600"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {/* 자동 합계 행 */}
            <tr className="bg-blue-50 font-bold">
              <td colSpan={3} className="border border-gray-300 px-1 py-1 text-center text-[10px]">합계</td>
              {COL_KEYS.map((k) => (
                <td key={k} className="border border-gray-300 px-1 py-1 text-center">{totals[k]}</td>
              ))}
              <td className="border border-gray-300 px-1 py-1 text-center bg-blue-100">{attendTotal}</td>
              <td className="border border-gray-300 px-1 py-1 text-center">{totals.bible}</td>
              <td className="border border-gray-300 px-1 py-1 text-center">{totals.prayer}</td>
              <td className="border border-gray-300"></td>
            </tr>
          </tbody>
        </table>
        <button
          onClick={() => addRow(divKey)}
          className="mt-1 px-3 py-1 text-[10px] bg-gray-100 text-gray-600 border border-gray-300 rounded hover:bg-gray-200"
        >
          줄추가
        </button>
      </div>
    );
  };

  return (
    <div className="flex gap-3">
      {/* 왼쪽: 구역 목록 */}
      <div className="w-28 flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 print:hidden">
        <div className="px-2 py-2 border-b border-gray-200 bg-gray-50">
          <h3 className="text-xs font-bold text-gray-700 text-center">구역 목록</h3>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`w-full text-left px-3 py-1.5 text-xs border-b border-gray-100 hover:bg-indigo-50 transition-colors ${
                g.id === selectedGroupId ? "bg-indigo-100 text-indigo-700 font-bold" : "text-gray-700"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* 오른쪽: 보고서 */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-base font-bold text-gray-800 flex items-center gap-2">권찰보고서 <HelpButton slug="council-report-entry" /></h1>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          {/* 보고서 제목 */}
          <div className="px-4 py-2 text-center border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-700">
              권찰보고서 — ({selectedGroup?.name || ""}) 구역 / {date}
            </h2>
          </div>

          {/* 장년반 + 중간반 테이블 */}
          <div className="p-3">
            <div className="flex flex-col lg:flex-row gap-3">
              {renderTable("adult", "장 년 반", adultRows, "bg-blue-50")}
              {renderTable("mid", "중 간 반", midRows, "bg-green-50")}
            </div>

            <p className="text-[10px] text-gray-400 mt-2">*장년반 예배에 참석한 출석 보고입니다. 합계=삼일+오일+주전+주후</p>
          </div>

          {/* 첨부파일 */}
          <div className="px-4 py-3 border-t border-gray-200 print:hidden">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-700">
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
                  disabled={uploading || !selectedGroupId}
                  className="px-3 py-1 text-[10px] bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {uploading ? "업로드 중..." : "파일 추가"}
                </button>
              </div>
            </div>
            {files.length > 0 ? (
              <div className="space-y-1">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1 border border-gray-200">
                    <FloppyIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
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
                      className="text-red-400 hover:text-red-600 shrink-0 text-[10px]"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-400">첨부파일 없음</p>
            )}
          </div>

          {/* 하단: 저장 */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => window.print()} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 print:hidden">
                인쇄
              </button>
              {message && (
                <span className={`text-sm ${message.includes("실패") || message.includes("오류") ? "text-red-600" : "text-green-600"}`}>
                  {message}
                </span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 print:hidden"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
