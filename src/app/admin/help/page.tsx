"use client";

import { useEffect, useState, useRef } from "react";

interface HelpItem {
  id: number;
  slug: string;
  title: string;
  sortOrder: number;
  updatedAt: string;
}

// 페이지별 슬러그 프리셋
const SLUG_PRESETS = [
  { slug: "board-write", label: "글쓰기" },
  { slug: "board-view", label: "게시글 조회" },
  // 관리자
  { slug: "admin-dashboard", label: "관리자 - 대시보드" },
  { slug: "admin-boards", label: "관리자 - 게시판 관리" },
  { slug: "admin-boards-create", label: "관리자 - 게시판 생성" },
  { slug: "admin-settings", label: "관리자 - 사이트 설정" },
  { slug: "admin-members", label: "관리자 - 회원 관리" },
  { slug: "admin-db", label: "관리자 - DB 관리" },
  { slug: "admin-sql", label: "관리자 - SQL 관리" },
  { slug: "admin-backup", label: "관리자 - 백업" },
  // 권찰회
  { slug: "council-report-entry", label: "권찰회 - 권찰보고서" },
  { slug: "council-overall", label: "권찰회 - 전체출석보고" },
  { slug: "council-report", label: "권찰회 - 보고서 조회" },
  { slug: "council-live", label: "권찰회 - 실시간참여" },
  { slug: "council-reading", label: "권찰회 - 재독듣기" },
  { slug: "council-manage", label: "권찰회 - 관리" },
  { slug: "council-summary", label: "권찰회 - 보고서 집계" },
  // 행정실 - 회계
  { slug: "accounting-entry", label: "행정실 - 전표입력" },
  { slug: "accounting-vouchers", label: "행정실 - 전표현황" },
  { slug: "accounting-report-monthly", label: "행정실 - 월별수입지출" },
  { slug: "accounting-report-account", label: "행정실 - 계정별현황" },
  { slug: "accounting-report-daily", label: "행정실 - 일자별현황" },
  { slug: "accounting-settlement", label: "행정실 - 결산현황" },
  { slug: "accounting-closing", label: "행정실 - 마감" },
  { slug: "accounting-accounts", label: "행정실 - 계정과목" },
  { slug: "accounting-units", label: "행정실 - 회계단위" },
  { slug: "accounting-balance", label: "행정실 - 이월잔액" },
  // 행정실 - 연보관리
  { slug: "offering-members", label: "연보 - 관리번호" },
  { slug: "offering-donor-info", label: "연보 - 기부자정보" },
  { slug: "offering-entry", label: "연보 - 연보입력" },
  { slug: "offering-list", label: "연보 - 연보내역" },
  { slug: "offering-thanks", label: "연보 - 감사연보현황" },
  { slug: "offering-summary", label: "연보 - 연보집계" },
  { slug: "offering-receipt", label: "연보 - 기부금영수증" },
  { slug: "offering-certificate", label: "연보 - 소속증명서" },
  // 기타
  { slug: "bible", label: "성경 읽기" },
  { slug: "hymn", label: "찬송 듣기" },
  { slug: "live", label: "실시간 예배" },
];

export default function AdminHelpPage() {
  const [items, setItems] = useState<HelpItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 편집 상태
  const [editing, setEditing] = useState<{ id?: number; slug: string; title: string; content: string; sortOrder: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [htmlMode, setHtmlMode] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const htmlAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItems = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/help");
    const data = await res.json();
    if (Array.isArray(data)) setItems(data);
    setLoading(false);
  };

  useEffect(() => { loadItems(); }, []);

  const startNew = () => {
    setEditing({ slug: "", title: "", content: "", sortOrder: 0 });
    setHtmlMode(false);
    setMsg("");
  };

  const startEdit = async (item: HelpItem) => {
    const res = await fetch(`/api/admin/help?slug=${item.slug}`);
    const data = await res.json();
    setEditing({
      id: data.id,
      slug: data.slug,
      title: data.title,
      content: data.content,
      sortOrder: data.sortOrder,
    });
    setHtmlMode(false);
    setMsg("");
    // contentEditable에 내용 로드
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = data.content;
    }, 100);
  };

  // WYSIWYG ↔ HTML 소스 토글.
  // 켤 때: 현재 DOM innerHTML 을 textarea 로 옮긴다.
  // 끌 때: textarea 의 HTML 을 DOM 에 다시 주입한다 (붙여넣은 태그가 실제 서식으로 해석됨).
  const toggleHtmlMode = () => {
    if (!editing) return;
    if (!htmlMode) {
      const html = editorRef.current?.innerHTML || "";
      setEditing({ ...editing, content: html });
      setHtmlMode(true);
    } else {
      const html = htmlAreaRef.current?.value ?? editing.content;
      setEditing({ ...editing, content: html });
      setHtmlMode(false);
      setTimeout(() => {
        if (editorRef.current) editorRef.current.innerHTML = html;
      }, 0);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const content = htmlMode
      ? (htmlAreaRef.current?.value ?? editing.content)
      : (editorRef.current?.innerHTML || "");
    if (!editing.slug.trim() || !editing.title.trim()) {
      setMsg("슬러그와 제목을 입력하세요.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/help", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editing, content }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg("저장되었습니다.");
      setEditing(null);
      loadItems();
      setTimeout(() => setMsg(""), 2000);
    } else {
      setMsg(data.message || "저장 실패");
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 도움말을 삭제하시겠습니까?")) return;
    await fetch("/api/admin/help", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadItems();
  };

  // 이미지 업로드
  const handleImageUpload = async () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch("/api/admin/help/upload", { method: "POST", body: fd });
    const data = await res.json();

    if (res.ok && data.url) {
      // 에디터에 이미지 삽입
      document.execCommand("insertImage", false, data.url);
    } else {
      alert(data.message || "업로드 실패");
    }
    e.target.value = "";
  };

  // 에디터 서식 명령
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  // 편집 모드
  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">
            {editing.id ? "도움말 수정" : "도움말 작성"}
          </h1>
          <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
            목록으로
          </button>
        </div>

        {msg && <div className="px-4 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded">{msg}</div>}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">슬러그 (페이지 식별자)</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded font-mono"
                  placeholder="board-write"
                />
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const preset = SLUG_PRESETS.find((p) => p.slug === e.target.value);
                      setEditing({ ...editing, slug: e.target.value, title: editing.title || preset?.label || "" });
                    }
                  }}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white"
                >
                  <option value="">프리셋</option>
                  {SLUG_PRESETS.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">제목</label>
              <input
                type="text"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded"
                placeholder="글쓰기 사용법"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">순서</label>
              <input
                type="number"
                value={editing.sortOrder}
                onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) || 0 })}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded"
              />
            </div>
          </div>

          {/* 에디터 툴바 */}
          <div className="flex flex-wrap gap-1 border border-gray-200 rounded-t px-2 py-1.5 bg-gray-50">
            <button onClick={() => execCmd("bold")} className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded" title="굵게">B</button>
            <button onClick={() => execCmd("italic")} className="px-2 py-1 text-xs italic hover:bg-gray-200 rounded" title="기울임">I</button>
            <button onClick={() => execCmd("underline")} className="px-2 py-1 text-xs underline hover:bg-gray-200 rounded" title="밑줄">U</button>
            <span className="text-gray-300 mx-1">|</span>
            <button onClick={() => execCmd("formatBlock", "h2")} className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded" title="제목">H2</button>
            <button onClick={() => execCmd("formatBlock", "h3")} className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded" title="소제목">H3</button>
            <button onClick={() => execCmd("formatBlock", "p")} className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="본문">P</button>
            <span className="text-gray-300 mx-1">|</span>
            <button onClick={() => execCmd("insertUnorderedList")} className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="목록">● 목록</button>
            <button onClick={() => execCmd("insertOrderedList")} className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="번호목록">1. 목록</button>
            <span className="text-gray-300 mx-1">|</span>
            <button onClick={() => execCmd("foreColor", "#dc2626")} className="px-2 py-1 text-xs text-red-600 hover:bg-gray-200 rounded" title="빨강">A</button>
            <button onClick={() => execCmd("foreColor", "#2563eb")} className="px-2 py-1 text-xs text-blue-600 hover:bg-gray-200 rounded" title="파랑">A</button>
            <button onClick={() => execCmd("hiliteColor", "#fef08a")} className="px-2 py-1 text-xs bg-yellow-200 hover:bg-yellow-300 rounded" title="형광">H</button>
            <span className="text-gray-300 mx-1">|</span>
            <button onClick={handleImageUpload} className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="이미지">📷 이미지</button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileSelected} className="hidden" />
            <span className="text-gray-300 mx-1">|</span>
            <button
              onClick={toggleHtmlMode}
              className={`px-2 py-1 text-xs rounded font-mono ${
                htmlMode ? "bg-blue-600 text-white hover:bg-blue-700" : "hover:bg-gray-200"
              }`}
              title="HTML 소스 보기/편집 — 태그가 그대로 보이면 여기서 붙여넣으세요"
            >
              &lt;/&gt; HTML
            </button>
          </div>

          {/* contentEditable 에디터 (WYSIWYG) */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className={`min-h-[400px] border border-gray-200 border-t-0 rounded-b px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 prose prose-sm max-w-none ${
              htmlMode ? "hidden" : ""
            }`}
            dangerouslySetInnerHTML={{ __html: editing.content }}
          />
          {/* HTML 소스 편집 모드 */}
          {htmlMode && (
            <textarea
              ref={htmlAreaRef}
              defaultValue={editing.content}
              className="w-full min-h-[400px] border border-gray-200 border-t-0 rounded-b px-4 py-3 text-xs font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-300 whitespace-pre"
              spellCheck={false}
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
            취소
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    );
  }

  // 목록 모드
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">도움말 관리</h1>
        <button onClick={startNew} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
          새 도움말 작성
        </button>
      </div>

      {msg && <div className="px-4 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded">{msg}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2 text-left w-48">슬러그</th>
              <th className="px-4 py-2 text-left">제목</th>
              <th className="px-4 py-2 text-center w-16">순서</th>
              <th className="px-4 py-2 text-center w-28">수정일</th>
              <th className="px-4 py-2 text-center w-24">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">로딩 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">등록된 도움말이 없습니다.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs text-gray-600">{item.slug}</td>
                <td className="px-4 py-2 text-gray-800">{item.title}</td>
                <td className="px-4 py-2 text-center text-gray-400">{item.sortOrder}</td>
                <td className="px-4 py-2 text-center text-xs text-gray-500">
                  {new Date(item.updatedAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-2 text-center">
                  <button onClick={() => startEdit(item)} className="text-blue-600 hover:underline text-xs mr-2">수정</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:underline text-xs">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-blue-800 mb-2">사용 안내</h3>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>슬러그는 페이지를 식별하는 키입니다. 프리셋에서 선택하거나 직접 입력하세요.</li>
          <li>작성된 도움말은 해당 페이지의 <strong>?</strong> 버튼을 클릭하면 표시됩니다.</li>
          <li>이미지는 에디터 툴바의 📷 버튼으로 업로드할 수 있습니다.</li>
          <li>스크린샷을 찍어서 업로드하면 사용자에게 시각적으로 안내할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  );
}
