"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const TipTapEditor = dynamic(() => import("@/components/board/TipTapEditor"), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-400 min-h-[400px]">
      에디터 로딩 중...
    </div>
  ),
});

interface Version {
  id: number;
  docType: string;
  content: string;
  version: string;
  changeType: string;
  changeNote: string | null;
  effectiveDate: string | null;
  createdAt: string;
  createdBy: number | null;
}

interface DiffPart { value: string; added: boolean; removed: boolean }

const DOC_LABELS: Record<string, string> = {
  privacy: "개인정보처리방침",
  terms: "이용약관",
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function fmtDateOnly(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function AdminLegalDocPage({ params }: { params: Promise<{ docType: string }> }) {
  const { docType } = use(params);
  const label = DOC_LABELS[docType] || docType;

  const [history, setHistory] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"edit" | "history" | "diff">("edit");

  // 편집 폼
  const [content, setContent] = useState("");
  const [version, setVersion] = useState("");
  const [changeType, setChangeType] = useState<"revision" | "improvement">("improvement");
  const [changeNote, setChangeNote] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  // 비교
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [diffParts, setDiffParts] = useState<DiffPart[] | null>(null);

  const reload = () => {
    setLoading(true);
    fetch(`/api/legal/${docType}?history=1`)
      .then((r) => r.json())
      .then((d) => setHistory(d.list || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, [docType]);

  // 현재 버전 = history[0]
  const current = history[0] || null;

  // 편집 폼 — 현재 버전을 기본값으로 채움
  useEffect(() => {
    if (current && !content) {
      setContent(current.content);
      setVersion(current.version);
    }
  }, [current, content]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { alert("본문을 입력하세요."); return; }
    if (!version.trim()) { alert("버전을 입력하세요."); return; }
    if (changeType === "revision" && !effectiveDate) {
      alert("개정 시 시행일을 지정해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/legal/${docType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          version,
          changeType,
          changeNote: changeNote.trim() || null,
          effectiveDate: effectiveDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "저장 실패");
        return;
      }
      setChangeNote("");
      setEffectiveDate("");
      reload();
      alert("등록되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 기존 정적 페이지에서 본문 가져오기 — DB 비어있을 때 초기 데이터 시드용.
  // /privacy 또는 /terms 페이지를 SSR 결과로 fetch → article 안 본문 추출.
  // header(시행일자), footer(인쇄안내), nav(목차) 는 제외.
  const importFromStatic = async () => {
    if (content.trim() && !confirm("현재 본문이 덮어쓰여집니다. 진행할까요?")) return;
    setImporting(true);
    try {
      const res = await fetch(`/${docType}`, { cache: "no-store" });
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const article = doc.querySelector("article");
      if (!article) {
        alert("기존 페이지에서 article 영역을 찾지 못했습니다.");
        return;
      }
      // header / footer / nav(목차) 제거
      article.querySelector("header")?.remove();
      article.querySelector("footer")?.remove();
      article.querySelectorAll("nav").forEach((n) => n.remove());

      // 안에 남은 section 들을 모아서 HTML 로
      // unused className/style 일부 정리 (불필요한 노이즈 줄임)
      article.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
      article.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));

      const cleaned = article.innerHTML.trim();
      setContent(cleaned);
      if (!version) setVersion("1.0");
    } catch (e) {
      console.error(e);
      alert("기존 페이지 가져오기 실패");
    } finally {
      setImporting(false);
    }
  };

  const runDiff = async () => {
    if (!fromId || !toId) {
      alert("비교할 두 버전을 선택하세요.");
      return;
    }
    if (fromId === toId) {
      alert("서로 다른 두 버전을 선택해 주세요.");
      return;
    }
    const res = await fetch(`/api/legal/${docType}/diff?from=${fromId}&to=${toId}`);
    if (!res.ok) {
      alert("비교 실패");
      return;
    }
    const d = await res.json();
    setDiffParts(d.parts || []);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/admin/legal" className="text-sm text-gray-500 hover:text-gray-800">
          ← 목록
        </Link>
        <span className="inline-block w-1 h-7 bg-blue-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">{label}</h1>
        {current && (
          <span className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
            현재 v{current.version}
          </span>
        )}
        <Link
          href={`/${docType}`}
          target="_blank"
          className="ml-auto text-xs text-blue-600 hover:underline"
        >
          공개 페이지 보기 →
        </Link>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { k: "edit", label: "새 버전 등록" },
          { k: "history", label: `이력 (${history.length})` },
          { k: "diff", label: "버전 비교" },
        ].map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k as "edit" | "history" | "diff")}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${
              tab === t.k
                ? "border-blue-700 text-blue-700 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭: 새 버전 등록 */}
      {tab === "edit" && (
        <form onSubmit={submit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">버전</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="예: 1.0, 2.0, 2.1"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">변경 유형</label>
              <select
                value={changeType}
                onChange={(e) => setChangeType(e.target.value as "revision" | "improvement")}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                <option value="improvement">개선 (오탈자·표현)</option>
                <option value="revision">개정 (실질적 변경)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                시행일 {changeType === "revision" && <span className="text-red-500">*</span>}
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                required={changeType === "revision"}
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">변경 사유 요약 (선택)</label>
              <input
                type="text"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="예: 제3자 제공 항목 추가"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-500">본문</label>
              <button
                type="button"
                onClick={importFromStatic}
                disabled={importing}
                className="text-[11px] px-2 py-1 border border-blue-300 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
                title="현재 공개 페이지(/privacy 또는 /terms)의 본문을 가져와 채웁니다"
              >
                {importing ? "가져오는 중..." : "📥 기존 페이지에서 가져오기"}
              </button>
            </div>
            <TipTapEditor
              content={content}
              onChange={(html) => setContent(html)}
              placeholder="본문을 입력하세요. 게시글 편집과 동일한 도구를 사용합니다."
              boardSlug={`legal-${docType}`}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              게시글과 동일한 리치 텍스트 에디터. 처음 등록 시 위 "📥 기존 페이지에서 가져오기" 로 기존 본문을 시드한 뒤 수정하세요.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? "등록 중..." : "새 버전 등록"}
            </button>
          </div>
        </form>
      )}

      {/* 탭: 이력 */}
      {tab === "history" && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading && <div className="p-8 text-center text-gray-400 text-sm">불러오는 중...</div>}
          {!loading && history.length === 0 && (
            <div className="p-12 text-center text-gray-400 text-sm">아직 등록된 버전이 없습니다.</div>
          )}
          {!loading && history.length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left w-14">#</th>
                  <th className="px-3 py-2 text-left w-20">버전</th>
                  <th className="px-3 py-2 text-left w-24">유형</th>
                  <th className="px-3 py-2 text-left w-28">시행일</th>
                  <th className="px-3 py-2 text-left">변경 사유</th>
                  <th className="px-3 py-2 text-right w-40">등록일시</th>
                </tr>
              </thead>
              <tbody>
                {history.map((v, idx) => (
                  <tr key={v.id} className={`border-b border-gray-100 ${idx === 0 ? "bg-emerald-50/50" : ""}`}>
                    <td className="px-3 py-2 font-mono text-gray-400">{v.id}</td>
                    <td className="px-3 py-2 font-bold text-gray-800">v{v.version}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        v.changeType === "revision"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {v.changeType === "revision" ? "개정" : "개선"}
                      </span>
                      {idx === 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800">
                          현재
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{fmtDateOnly(v.effectiveDate)}</td>
                    <td className="px-3 py-2 text-gray-700">{v.changeNote || "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{fmtDate(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 탭: 버전 비교 */}
      {tab === "diff" && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">이전 버전 (from)</label>
                <select
                  value={fromId || ""}
                  onChange={(e) => setFromId(parseInt(e.target.value, 10) || null)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="">선택...</option>
                  {history.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} ({v.changeType === "revision" ? "개정" : "개선"}) — {fmtDateOnly(v.createdAt)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">새 버전 (to)</label>
                <select
                  value={toId || ""}
                  onChange={(e) => setToId(parseInt(e.target.value, 10) || null)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="">선택...</option>
                  {history.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} ({v.changeType === "revision" ? "개정" : "개선"}) — {fmtDateOnly(v.createdAt)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={runDiff}
                className="px-4 py-1.5 text-sm bg-blue-700 text-white rounded hover:bg-blue-800"
              >
                비교
              </button>
            </div>
          </div>

          {diffParts && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-600 flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-300 inline-block" /> 삭제됨</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-green-100 border border-green-300 inline-block" /> 추가됨</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-gray-50 border border-gray-300 inline-block" /> 변동 없음</span>
              </div>
              <pre className="p-4 text-xs whitespace-pre-wrap leading-relaxed font-mono max-h-[60vh] overflow-y-auto">
                {diffParts.map((p, i) => (
                  <span
                    key={i}
                    className={
                      p.added
                        ? "bg-green-100 text-green-900"
                        : p.removed
                          ? "bg-red-100 text-red-900 line-through"
                          : "text-gray-700"
                    }
                  >
                    {p.value}
                  </span>
                ))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
