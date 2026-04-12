"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { SKINS, getSkinTypeLabel } from "@/lib/skins";
import type { SkinConfig } from "@/lib/skins";

export default function AdminBoardEditPage() {
  const router = useRouter();
  const params = useParams();
  const boardId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedSkin, setSelectedSkin] = useState<SkinConfig | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [categoryList, setCategoryList] = useState<{ id?: number; name: string }[]>([]);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    fetch(`/api/admin/boards/${boardId}`)
      .then((r) => r.json())
      .then((data) => {
        setForm(data);
        if (data.skinName) {
          const skin = SKINS.find((s) => s.id === data.skinName);
          if (skin) setSelectedSkin(skin);
        }
        if (data.categories && Array.isArray(data.categories)) {
          setCategoryList(data.categories.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => setError("게시판 정보를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, [boardId]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm({ ...form, [name]: (e.target as HTMLInputElement).checked });
    } else if (type === "number") {
      setForm({ ...form, [name]: parseInt(value, 10) || 0 });
    } else {
      setForm({ ...form, [name]: value });
    }
  }

  function selectSkin(skin: SkinConfig | null) {
    setSelectedSkin(skin);
    setForm({ ...form, skinName: skin?.id || "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch(`/api/admin/boards/${boardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, categories: categoryList }),
      });
      if (res.ok) {
        alert("저장되었습니다.");
        setSuccess("저장되었습니다.");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.message || "저장에 실패했습니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("정말로 이 게시판을 삭제하시겠습니까? 모든 게시글과 댓글이 삭제됩니다.")) return;
    try {
      const res = await fetch(`/api/admin/boards/${boardId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/boards");
        router.refresh();
      }
    } catch {
      alert("삭제에 실패했습니다.");
    }
  }

  if (loading) return <div className="py-12 text-center text-gray-400">로딩 중...</div>;

  const levelOptions = [1, 2, 3, 5, 7, 9, 10].map((v) => ({
    value: v,
    label: v === 1 ? "레벨1 (최고관리자)" : v === 10 ? "레벨10 (일반회원)" : `레벨 ${v}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">
          게시판 설정 — {String(form.title || "")}
        </h1>
        <button
          onClick={handleDelete}
          className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
        >
          게시판 삭제
        </button>
      </div>

      {error && <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}
      {success && <div className="px-4 py-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 기본 정보 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">기본 정보</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">게시판 ID</label>
              <input
                type="text"
                value={String(form.slug || "")}
                disabled
                className="w-full px-3 py-2 text-sm border bg-gray-50 border-gray-200 rounded text-gray-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">게시판 이름</label>
              <input
                type="text"
                name="title"
                value={String(form.title || "")}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">유형</label>
              <select name="boardType" value={String(form.boardType || "BBS")} onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500">
                <option value="BBS">BBS</option>
                <option value="GALLERY">갤러리</option>
                <option value="DOWNLOAD">자료실</option>
                <option value="MUSIC">음악</option>
                <option value="VOTE">투표</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">페이지당 글 수</label>
              <input type="number" name="postsPerPage" value={Number(form.postsPerPage || 15)} onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">최대 업로드</label>
              <input type="number" name="maxUploadSize" value={Number(form.maxUploadSize || 2097152)} onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">정렬 순서</label>
              <input type="number" name="sortOrder" value={Number(form.sortOrder ?? 0)} onChange={handleChange} min={0}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
              <p className="text-xs text-gray-400 mt-1">숫자가 작을수록 앞에 표시</p>
            </div>
          </div>
          <div className="px-4 pb-4 flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" name="showInMenu" checked={!!form.showInMenu} onChange={handleChange}
                className="rounded border-gray-300 text-blue-600" />
              헤더 메뉴에 표시
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" name="showOnMain" checked={!!form.showOnMain} onChange={handleChange}
                className="rounded border-gray-300 text-blue-600" />
              메인 페이지에 표시
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" name="requireLogin" checked={!!form.requireLogin} onChange={handleChange}
                className="rounded border-gray-300 text-orange-600" />
              로그인 시에만 표시
            </label>
          </div>
        </section>

        {/* 스킨 변경 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">
              스킨: {selectedSkin ? selectedSkin.name : "기본"}
            </h2>
          </div>
          <div className="p-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <button type="button" onClick={() => selectSkin(null)}
              className={`p-2 rounded border-2 text-center text-xs ${!selectedSkin ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
              기본
            </button>
            {SKINS.map((skin) => (
              <button key={skin.id} type="button" onClick={() => selectSkin(skin)}
                className={`p-2 rounded border-2 text-center transition-all ${selectedSkin?.id === skin.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="w-full h-6 rounded mb-1 flex">
                  <div className="flex-1" style={{ backgroundColor: skin.styles.headerBg }} />
                  <div className="flex-1" style={{ backgroundColor: skin.styles.primaryColor }} />
                </div>
                <p className="text-xs text-gray-700 truncate">{skin.name}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 기능 + 권한 (간소화) */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">기능 설정</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["useCategory","useComment","useSecret","useReply","useHtml","useFileUpload","useAutolink","useShowIp"].map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" name={k} checked={!!form[k]} onChange={handleChange} className="rounded border-gray-300 text-blue-600" />
                  {k.replace("use", "")}
                </label>
              ))}
            </div>
            {/* 댓글 정책 기본값 */}
            <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-600 font-medium shrink-0">댓글 정책 기본값</span>
              {([
                { value: "ALLOW_EDIT", label: "수정가능" },
                { value: "ALLOW", label: "추가만" },
                { value: "DISABLED", label: "댓글없음" },
              ] as const).map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="radio"
                    name="defaultCommentPolicy"
                    value={opt.value}
                    checked={String(form.defaultCommentPolicy || "ALLOW_EDIT") === opt.value}
                    onChange={handleChange}
                    className="w-3.5 h-3.5 text-blue-600 accent-blue-600"
                  />
                  {opt.label}
                </label>
              ))}
              <span className="text-xs text-gray-400 ml-2">새 글 작성 시 적용됩니다</span>
            </div>
          </div>
        </section>

        {/* 게시판 안내 문구 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">게시판 안내 문구</h2>
          </div>
          <div className="p-4">
            <textarea
              value={String(form.guideText || "")}
              onChange={(e) => setForm({ ...form, guideText: e.target.value })}
              rows={3}
              placeholder="게시판 상단에 표시할 안내 문구를 입력하세요"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">게시판 목록과 글쓰기 페이지 상단에 표시됩니다. 비워두면 표시되지 않습니다.</p>
          </div>
        </section>

        {/* 카테고리 관리 */}
        {!!form.useCategory && (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-700">
                카테고리 관리
                <span className="ml-2 text-xs font-normal text-gray-400">({categoryList.length}개)</span>
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {categoryList.length > 0 && (
                <div className="space-y-1">
                  {categoryList.map((cat, idx) => (
                    <div key={cat.id ?? `new-${idx}`} className="flex items-center gap-2 group">
                      <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                      <span className="flex-1 text-sm text-gray-700 px-2 py-1 bg-gray-50 rounded">{cat.name}</span>
                      <button type="button" onClick={() => {
                        if (idx > 0) { const arr = [...categoryList]; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; setCategoryList(arr); }
                      }} disabled={idx === 0} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30" title="위로">▲</button>
                      <button type="button" onClick={() => {
                        if (idx < categoryList.length - 1) { const arr = [...categoryList]; [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]]; setCategoryList(arr); }
                      }} disabled={idx === categoryList.length - 1} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30" title="아래로">▼</button>
                      <button type="button" onClick={() => setCategoryList(categoryList.filter((_, i) => i !== idx))}
                        className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="삭제">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newCategory.trim()) { setCategoryList([...categoryList, { name: newCategory.trim() }]); setNewCategory(""); } } }}
                  placeholder="카테고리명 입력 후 Enter 또는 추가 버튼"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
                <button type="button" onClick={() => { if (newCategory.trim()) { setCategoryList([...categoryList, { name: newCategory.trim() }]); setNewCategory(""); } }}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">추가</button>
              </div>
              {categoryList.length === 0 && (
                <p className="text-xs text-gray-400">카테고리를 추가하세요. 첫 번째 카테고리가 글쓰기 시 기본 선택됩니다.</p>
              )}
            </div>
          </section>
        )}

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">접근 권한</h2>
          </div>
          <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {["grantList","grantView","grantWrite","grantComment","grantReply","grantDelete","grantNotice","grantViewSecret"].map((k) => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{k.replace("grant", "")}</label>
                <select name={k} value={Number(form[k]) || 10} onChange={handleChange}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500">
                  {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-between">
          <button type="button" onClick={() => router.push("/admin/boards")}
            className="px-5 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">취소</button>
          <button type="submit" disabled={submitting}
            className="px-6 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
            {submitting ? "저장 중..." : "설정 저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
