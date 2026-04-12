"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SKINS, getSkinTypeLabel } from "@/lib/skins";
import type { SkinConfig } from "@/lib/skins";

type BoardType = "BBS" | "GALLERY" | "DOWNLOAD" | "MUSIC" | "VOTE";

export default function AdminBoardCreatePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedSkin, setSelectedSkin] = useState<SkinConfig | null>(null);
  const [skinFilter, setSkinFilter] = useState<string>("all");
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");

  const [form, setForm] = useState({
    slug: "",
    title: "",
    boardType: "BBS" as BoardType,
    skinName: "",
    postsPerPage: 15,
    pagesPerBlock: 8,
    useCategory: false,
    useComment: true,
    defaultCommentPolicy: "ALLOW_EDIT" as string,
    useSecret: true,
    useReply: true,
    useHtml: true,
    useFileUpload: false,
    useAutolink: true,
    useShowIp: false,
    maxUploadSize: 2097152,
    grantList: 10,
    grantView: 10,
    grantWrite: 10,
    grantComment: 10,
    grantReply: 10,
    grantDelete: 1,
    grantNotice: 1,
    grantViewSecret: 1,
    sortOrder: 0,
    showInMenu: true,
    showOnMain: true,
    requireLogin: false,
  });

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

  function selectSkin(skin: SkinConfig) {
    setSelectedSkin(skin);
    setForm({ ...form, skinName: skin.id });
  }

  // 스킨 필터링
  const filteredSkins = skinFilter === "all"
    ? SKINS
    : SKINS.filter((s) => s.type === skinFilter);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.slug.trim()) { setError("게시판 ID를 입력하세요."); return; }
    if (!form.title.trim()) { setError("게시판 이름을 입력하세요."); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(form.slug)) {
      setError("게시판 ID는 영문, 숫자, 밑줄만 사용 가능합니다.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, categories: categoryList }),
      });

      if (res.ok) {
        router.push("/admin/boards");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.message || "생성에 실패했습니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const levelOptions = [
    { value: 1, label: "레벨 1 (최고관리자)" },
    { value: 2, label: "레벨 2 (부관리자)" },
    { value: 3, label: "레벨 3" },
    { value: 5, label: "레벨 5" },
    { value: 7, label: "레벨 7" },
    { value: 9, label: "레벨 9" },
    { value: 10, label: "레벨 10 (일반회원)" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">게시판 생성</h1>

      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 기본 정보 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">기본 정보</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  게시판 ID (slug) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="slug"
                  value={form.slug}
                  onChange={handleChange}
                  required
                  pattern="[a-zA-Z0-9_]+"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="예: DcNewBoard"
                />
                <p className="text-xs text-gray-400 mt-1">URL에 사용됩니다: /board/{form.slug || "..."}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  게시판 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  placeholder="예: 새 게시판"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">게시판 유형</label>
                <select
                  name="boardType"
                  value={form.boardType}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                >
                  <option value="BBS">일반 게시판 (BBS)</option>
                  <option value="GALLERY">갤러리</option>
                  <option value="DOWNLOAD">자료실</option>
                  <option value="MUSIC">음악</option>
                  <option value="VOTE">투표</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">페이지당 글 수</label>
                <input
                  type="number"
                  name="postsPerPage"
                  value={form.postsPerPage}
                  onChange={handleChange}
                  min={5}
                  max={100}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">최대 업로드 (바이트)</label>
                <input
                  type="number"
                  name="maxUploadSize"
                  value={form.maxUploadSize}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">{(form.maxUploadSize / 1048576).toFixed(1)} MB</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">정렬 순서</label>
                <input
                  type="number"
                  name="sortOrder"
                  value={form.sortOrder}
                  onChange={handleChange}
                  min={0}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">숫자가 작을수록 앞에 표시</p>
              </div>
              <div className="flex items-center gap-6 pt-5">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="showInMenu"
                    checked={form.showInMenu}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  헤더 메뉴에 표시
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="showOnMain"
                    checked={form.showOnMain}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  메인 페이지에 표시
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="requireLogin"
                    checked={form.requireLogin}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-orange-600"
                  />
                  로그인 시에만 표시
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* 스킨 선택 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">
              스킨 선택
              {selectedSkin && (
                <span className="ml-2 font-normal text-blue-600">
                  — {selectedSkin.name}
                </span>
              )}
            </h2>
            <div className="flex gap-1">
              {[
                { value: "all", label: "전체" },
                { value: "bbs", label: "BBS" },
                { value: "gallery", label: "갤러리" },
                { value: "music", label: "음악" },
                { value: "download", label: "자료실" },
                { value: "vote", label: "투표" },
                { value: "web", label: "웹진" },
              ].map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setSkinFilter(f.value)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    skinFilter === f.value
                      ? "bg-gray-700 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* 기본 (스킨 없음) */}
              <button
                type="button"
                onClick={() => { setSelectedSkin(null); setForm({ ...form, skinName: "" }); }}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  !selectedSkin
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="w-full h-16 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs mb-2">
                  기본 스킨
                </div>
                <p className="text-sm font-medium text-gray-800">기본</p>
                <p className="text-xs text-gray-500">Tailwind 기본 디자인</p>
              </button>

              {/* 스킨 목록 */}
              {filteredSkins.map((skin) => (
                <button
                  key={skin.id}
                  type="button"
                  onClick={() => selectSkin(skin)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    selectedSkin?.id === skin.id
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* 색상 프리뷰 */}
                  <div className="w-full h-16 rounded overflow-hidden mb-2 flex flex-col">
                    <div
                      className="h-4"
                      style={{ backgroundColor: skin.styles.headerBg }}
                    />
                    <div
                      className="flex-1 flex items-center justify-center"
                      style={{ backgroundColor: skin.styles.bgColor }}
                    >
                      <div className="flex gap-1">
                        <div className="w-6 h-1.5 rounded" style={{ backgroundColor: skin.styles.primaryColor }} />
                        <div className="w-8 h-1.5 rounded" style={{ backgroundColor: skin.styles.borderColor }} />
                        <div className="w-5 h-1.5 rounded" style={{ backgroundColor: skin.styles.accentColor }} />
                      </div>
                    </div>
                    <div
                      className="h-1"
                      style={{ backgroundColor: skin.styles.borderColor }}
                    />
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">{skin.name}</p>
                  <p className="text-xs text-gray-500 truncate">{getSkinTypeLabel(skin.type)}</p>
                </button>
              ))}
            </div>

            {/* 선택된 스킨 상세 */}
            {selectedSkin && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-gray-800">{selectedSkin.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{selectedSkin.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>제작자: {selectedSkin.author}</span>
                      <span>유형: {getSkinTypeLabel(selectedSkin.type)}</span>
                      <span>ID: {selectedSkin.id}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500">지원 게시판:</span>
                      {selectedSkin.supportedBoards.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {Object.entries(selectedSkin.styles).slice(0, 6).map(([key, val]) => (
                      <div
                        key={key}
                        className="w-6 h-6 rounded border border-gray-300"
                        style={{ backgroundColor: val as string }}
                        title={`${key}: ${val}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 기능 설정 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">기능 설정</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { name: "useCategory", label: "카테고리" },
                { name: "useComment", label: "댓글" },
                { name: "useSecret", label: "비밀글" },
                { name: "useReply", label: "답글" },
                { name: "useHtml", label: "HTML 사용" },
                { name: "useFileUpload", label: "파일 업로드" },
                { name: "useAutolink", label: "자동 링크" },
                { name: "useShowIp", label: "IP 표시" },
              ].map((opt) => (
                <label key={opt.name} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name={opt.name}
                    checked={form[opt.name as keyof typeof form] as boolean}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {/* 댓글 정책 기본값 */}
            <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100">
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
                    checked={form.defaultCommentPolicy === opt.value}
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

        {/* 카테고리 관리 (useCategory가 켜져 있을 때만 표시) */}
        {form.useCategory && (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-700">
                카테고리 관리
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({categoryList.length}개)
                </span>
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {categoryList.length > 0 && (
                <div className="space-y-1">
                  {categoryList.map((cat, idx) => (
                    <div key={idx} className="flex items-center gap-2 group">
                      <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                      <span className="flex-1 text-sm text-gray-700 px-2 py-1 bg-gray-50 rounded">{cat}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx > 0) {
                            const arr = [...categoryList];
                            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                            setCategoryList(arr);
                          }
                        }}
                        disabled={idx === 0}
                        className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="위로"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx < categoryList.length - 1) {
                            const arr = [...categoryList];
                            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                            setCategoryList(arr);
                          }
                        }}
                        disabled={idx === categoryList.length - 1}
                        className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="아래로"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryList(categoryList.filter((_, i) => i !== idx))}
                        className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newCategory.trim()) {
                        setCategoryList([...categoryList, newCategory.trim()]);
                        setNewCategory("");
                      }
                    }
                  }}
                  placeholder="카테고리명 입력 후 Enter 또는 추가 버튼"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCategory.trim()) {
                      setCategoryList([...categoryList, newCategory.trim()]);
                      setNewCategory("");
                    }
                  }}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  추가
                </button>
              </div>
              {categoryList.length === 0 && (
                <p className="text-xs text-gray-400">카테고리를 추가하세요. 첫 번째 카테고리가 글쓰기 시 기본 선택됩니다.</p>
              )}
            </div>
          </section>
        )}

        {/* 권한 설정 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">접근 권한 (레벨이 낮을수록 높은 권한)</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { name: "grantList", label: "목록 보기" },
                { name: "grantView", label: "글 읽기" },
                { name: "grantWrite", label: "글 쓰기" },
                { name: "grantComment", label: "댓글 쓰기" },
                { name: "grantReply", label: "답글 쓰기" },
                { name: "grantDelete", label: "글 삭제" },
                { name: "grantNotice", label: "공지 등록" },
                { name: "grantViewSecret", label: "비밀글 보기" },
              ].map((perm) => (
                <div key={perm.name}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{perm.label}</label>
                  <select
                    name={perm.name}
                    value={form[perm.name as keyof typeof form] as number}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  >
                    {levelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 제출 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {submitting ? "생성 중..." : "게시판 생성"}
          </button>
        </div>
      </form>
    </div>
  );
}
