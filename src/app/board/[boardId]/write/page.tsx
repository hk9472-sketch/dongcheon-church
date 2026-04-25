"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense, use } from "react";
import dynamic from "next/dynamic";
import HelpButton from "@/components/HelpButton";
import CaptchaField from "@/components/CaptchaField";
import FloppyIcon from "@/components/icons/FloppyIcon";

// TipTap 은 무거운 에디터 (@tiptap/* + prosemirror 다수). 글쓰기 진입 시에만 로드하도록
// 동적 import 로 분리해 초기 번들 사이즈 감소.
const TipTapEditor = dynamic(() => import("@/components/board/TipTapEditor"), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-400 min-h-[200px]">
      에디터 로딩 중...
    </div>
  ),
});

// ============================================================
// 글쓰기/수정/답글 페이지 (제로보드 write.php 대체)
// URL: /board/[boardId]/write?mode=write|reply|modify&no=123
// ============================================================

function WriteForm({ boardId }: { boardId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = searchParams.get("mode") || "write";
  const parentNo = searchParams.get("no");

  const [boardTitle, setBoardTitle] = useState("");
  const [guideText, setGuideText] = useState("");
  const [loading, setLoading] = useState(mode === "modify");
  const [submitting, setSubmitting] = useState(false);

  // 폼 상태
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [homepage, setHomepage] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [isNotice, setIsNotice] = useState(false);
  const [useHtml, setUseHtml] = useState(true);
  const [commentPolicy, setCommentPolicy] = useState("ALLOW_EDIT");
  const [sitelink1, setSitelink1] = useState("");
  const [sitelink2, setSitelink2] = useState("");
  // 기존 첨부 (수정 모드에서만 채워짐) — 유지할지 삭제할지 UI 에서 토글
  const [existingAttachments, setExistingAttachments] = useState<
    { id: number; origName: string; fileName: string; sortOrder: number }[]
  >([]);
  // 새로 추가할 파일들
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [useCategory, setUseCategory] = useState(false);

  // 확장 섹션 토글
  const [showExtra, setShowExtra] = useState(false);

  // 로그인 상태 + CAPTCHA
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [loggedInName, setLoggedInName] = useState<string>("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

  const subjectRef = useRef<HTMLInputElement>(null);

  // 로그인 상태 확인 — 마운트 시 + 탭이 다시 포커스될 때마다.
  // 작성 중 다른 탭에서 로그아웃한 사용자가 이 탭으로 돌아왔을 때
  // 비회원 폼(이름/비번/CAPTCHA) 로 즉시 전환되도록 한다.
  useEffect(() => {
    function checkSession() {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => {
          const loggedIn = !!d.user;
          setIsLoggedIn(loggedIn);
          if (loggedIn) {
            setLoggedInName(d.user.name || "");
            setName(d.user.name || "");
            setPassword("__session__");
          } else {
            // 로그아웃 감지 → 더미 값 클리어해서 실제 이름/비번 입력 받도록
            setLoggedInName("");
            setName((prev) => (prev === loggedInName ? "" : prev));
            setPassword((prev) => (prev === "__session__" ? "" : prev));
          }
        })
        .catch(() => setIsLoggedIn(false));
    }
    checkSession();
    function onVisibility() {
      if (document.visibilityState === "visible") checkSession();
    }
    function onFocus() {
      checkSession();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 게시판 설정 및 수정 모드 데이터 로드
  useEffect(() => {
    async function load() {
      try {
        // 게시판 정보
        const boardRes = await fetch(`/api/board/info?slug=${boardId}`);
        let boardUseHtml = true;
        if (boardRes.ok) {
          const boardData = await boardRes.json();
          setBoardTitle(boardData.title);
          setGuideText(boardData.guideText || "");
          setUseCategory(boardData.useCategory);
          boardUseHtml = boardData.useHtml ?? true;
          // 새 글/답글 모드에서 게시판 기본 댓글 정책 적용
          if (mode !== "modify" && boardData.defaultCommentPolicy) {
            setCommentPolicy(boardData.defaultCommentPolicy);
          }
          if (boardData.categories) {
            setCategories(boardData.categories);
            // 새 글/답글 모드에서 첫 번째 카테고리를 기본 선택
            if (mode !== "modify" && boardData.useCategory && boardData.categories.length > 0) {
              setCategoryId(String(boardData.categories[0].id));
            }
          }
        }

        // 수정 모드: 기존 글 데이터
        if (mode === "modify" && parentNo) {
          const postRes = await fetch(`/api/board/post?id=${parentNo}`);
          if (postRes.ok) {
            const post = await postRes.json();

            // 권한 확인: 서버가 반환한 canEdit 기준
            if (!post.canEdit) {
              alert("수정 권한이 없습니다.");
              router.replace(`/board/${boardId}/${parentNo}`);
              return;
            }

            setSubject(post.subject);
            // 이관된 글(useHtml=false)은 \n이 줄바꿈 → <br>로 변환하여 에디터에 반영
            setContent(post.useHtml ? post.content : post.content.replace(/\n/g, "<br>"));
            setName(post.authorName);
            setEmail(post.email || "");
            setHomepage(post.homepage || "");
            setIsSecret(post.isSecret);
            // 수정 모드에서는 게시판의 useHtml 설정 사용 (이관된 글에 false가 있어도 툴바 표시)
            setUseHtml(boardUseHtml);
            setCommentPolicy(post.commentPolicy || "ALLOW");
            setSitelink1(post.sitelink1 || "");
            setSitelink2(post.sitelink2 || "");
            if (post.categoryId) setCategoryId(String(post.categoryId));
            // 기존 첨부 로드
            if (Array.isArray(post.attachments) && post.attachments.length > 0) {
              setExistingAttachments(
                post.attachments.map((a: { id: number; fileName: string; origName: string; sortOrder: number }) => ({
                  id: a.id,
                  fileName: a.fileName,
                  origName: a.origName,
                  sortOrder: a.sortOrder,
                }))
              );
            }
            // 수정 모드에서 기존 링크/파일 있으면 확장 섹션 열기
            if (
              post.sitelink1 || post.sitelink2 || post.email || post.homepage ||
              (Array.isArray(post.attachments) && post.attachments.length > 0)
            ) {
              setShowExtra(true);
            }
          }
        }

        // 답글 모드: 원글 제목 가져오기
        if (mode === "reply" && parentNo) {
          const postRes = await fetch(`/api/board/post?id=${parentNo}`);
          if (postRes.ok) {
            const post = await postRes.json();
            setSubject(`Re: ${post.subject}`);
          }
        }
      } catch (err) {
        console.error("로드 실패:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [boardId, mode, parentNo]);

  // 로드 완료 후 제목 필드에 포커스
  useEffect(() => {
    if (!loading && subjectRef.current && mode !== "modify") {
      subjectRef.current.focus();
    }
  }, [loading, mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 비로그인 사용자만 이름/비밀번호 필수
    if (isLoggedIn !== true) {
      if (!name.trim()) { alert("이름을 입력하세요."); return; }
      if (!password.trim()) { alert("비밀번호를 입력하세요."); return; }
    }
    if (!subject.trim()) { alert("제목을 입력하세요."); return; }
    if (!content.trim()) { alert("내용을 입력하세요."); return; }

    // 비로그인 시 CAPTCHA 필수 — 쓰기·답글·수정 모두 해당
    if (isLoggedIn !== true && !captchaAnswer) {
      alert("보안 문자를 입력하세요.");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("boardSlug", boardId);
      formData.append("mode", mode);
      formData.append("name", name);
      formData.append("password", password);
      formData.append("email", email);
      formData.append("homepage", homepage);
      formData.append("subject", subject.trim());
      formData.append("content", content);
      formData.append("isSecret", String(isSecret));
      formData.append("isNotice", String(isNotice));
      formData.append("useHtml", String(useHtml));
      formData.append("commentPolicy", commentPolicy);
      formData.append("sitelink1", sitelink1);
      formData.append("sitelink2", sitelink2);
      if (categoryId) formData.append("categoryId", categoryId);
      if (parentNo) formData.append("parentNo", parentNo);
      // 다중 첨부 — 유지할 기존 파일 id 배열
      formData.append("keepIds", JSON.stringify(existingAttachments.map((a) => a.id)));
      for (const f of newFiles) {
        formData.append("files", f);
      }
      // 비로그인 시 CAPTCHA 토큰 포함 — 수정 모드에서도 필수
      if (isLoggedIn !== true) {
        formData.append("captchaAnswer", captchaAnswer);
        formData.append("captchaToken", captchaToken);
      }

      const res = await fetch("/api/board/write", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/board/${boardId}/${data.postId}`);
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "등록에 실패했습니다.");
      }
    } catch {
      alert("등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const modeLabel = mode === "modify" ? "수정" : mode === "reply" ? "답글 작성" : "글쓰기";

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            title="뒤로가기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">
            {boardTitle}
            <span className="mx-2 text-gray-300 font-normal">|</span>
            <span className="text-blue-700">{modeLabel}</span>
          </h1>
          <HelpButton slug="board-write" />
        </div>
      </div>

      <div className="px-4 py-2.5 bg-blue-50/60 border border-blue-100 rounded text-xs text-gray-500 italic leading-relaxed whitespace-pre-line">
        {guideText || "예배당처럼 아끼고 서로 조심하셨으면 합니다.\n주로 우리 교인들이 사용하겠지만 혹 손님들이 오시더라도 깨끗한 우리의 모습을 보였으면 좋겠고, 서로의 신앙에 유익이 되도록 했으면 좋겠습니다."}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" style={{ fontFamily: "var(--skin-write-font)", fontSize: "var(--skin-write-font-size)", color: "var(--skin-write-font-color)" }}>
        {/* ─── 작성자 정보 섹션 ─── */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ border: "1px solid var(--skin-write-border-color)" }}>
          <div className="px-5 py-3 bg-gray-50" style={{ borderBottom: "1px solid var(--skin-write-border-color)" }}>
            <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              작성자 정보
            </h2>
          </div>
          <div className="p-5">
            {isLoggedIn === true ? (
              <div className="text-sm text-gray-700">
                작성자: <strong className="text-gray-900">{loggedInName}</strong>
                <span className="ml-2 text-xs text-gray-400">(로그인 계정으로 등록됩니다)</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    이름 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="이름을 입력하세요"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    비밀번호 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="수정/삭제 시 필요합니다"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── 글 내용 섹션 ─── */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ border: "1px solid var(--skin-write-border-color)" }}>
          <div className="px-5 py-3 bg-gray-50" style={{ borderBottom: "1px solid var(--skin-write-border-color)" }}>
            <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              글 내용
            </h2>
          </div>
          <div className="p-5 space-y-4">
            {/* 제목 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                제목 <span className="text-red-400">*</span>
              </label>
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="제목을 입력하세요"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors font-medium"
              />
            </div>

            {/* 카테고리 (제목 아래) */}
            {useCategory && categories.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">카테고리</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full sm:w-48 px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors bg-white"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 본문 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                내용 <span className="text-red-400">*</span>
              </label>
              {useHtml ? (
                <TipTapEditor
                  content={content}
                  onChange={(html) => setContent(html)}
                  placeholder="내용을 입력하세요"
                  boardSlug={boardId}
                />
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={18}
                  placeholder="내용을 입력하세요"
                  className="w-full px-3.5 py-3 text-sm border border-gray-400 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors leading-relaxed"
                />
              )}
            </div>
          </div>
        </div>

        {/* ─── 첨부파일 섹션 ─── */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ border: "1px solid var(--skin-write-border-color)" }}>
          <div className="px-5 py-3 bg-gray-50" style={{ borderBottom: "1px solid var(--skin-write-border-color)" }}>
            <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              첨부파일
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {/* 기존 첨부 목록 (수정 모드) */}
            {existingAttachments.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-gray-500">기존 첨부 — 삭제하려면 ✕ 클릭</div>
                {existingAttachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded bg-gray-50"
                  >
                    <FloppyIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="flex-1 truncate">{a.origName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setExistingAttachments((prev) => prev.filter((x) => x.id !== a.id))
                      }
                      className="w-7 h-7 flex items-center justify-center text-red-500 border border-gray-300 rounded hover:bg-red-50 hover:border-red-400"
                      title="삭제"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 새로 추가 — 드래그앤드롭 + 다중 선택 */}
            <label
              className="group flex flex-col items-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-blue-500", "bg-blue-50/50");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("border-blue-500", "bg-blue-50/50");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-blue-500", "bg-blue-50/50");
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length > 0) {
                  setNewFiles((prev) => [...prev, ...dropped]);
                }
              }}
            >
              <svg className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm text-gray-500 group-hover:text-blue-600 transition-colors">
                클릭 또는 드래그해서 파일 추가 (여러 개 가능)
              </span>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  if (picked.length > 0) setNewFiles((prev) => [...prev, ...picked]);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>

            {/* 새로 추가된 파일 목록 */}
            {newFiles.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-gray-500">새 첨부</div>
                {newFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-blue-200 rounded bg-blue-50/40"
                  >
                    <FloppyIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(1)}KB</span>
                    <button
                      type="button"
                      onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="w-7 h-7 flex items-center justify-center text-red-500 border border-gray-300 rounded hover:bg-red-50 hover:border-red-400"
                      title="제거"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── 추가 정보 (접이식) ─── */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ border: "1px solid var(--skin-write-border-color)" }}>
          <button
            type="button"
            onClick={() => setShowExtra(!showExtra)}
            className="w-full px-5 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
            style={{ borderBottom: "1px solid var(--skin-write-border-color)" }}
          >
            <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              추가 정보
              <span className="text-xs font-normal text-gray-400">이메일, 홈페이지, 링크</span>
            </h2>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showExtra ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showExtra && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">이메일</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">홈페이지</label>
                  <input
                    type="url"
                    value={homepage}
                    onChange={(e) => setHomepage(e.target.value)}
                    placeholder="https://"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">링크 1</label>
                  <input
                    type="url"
                    value={sitelink1}
                    onChange={(e) => setSitelink1(e.target.value)}
                    placeholder="https://"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">링크 2</label>
                  <input
                    type="url"
                    value={sitelink2}
                    onChange={(e) => setSitelink2(e.target.value)}
                    placeholder="https://"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── 옵션 & 등록 버튼 ─── */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ border: "1px solid var(--skin-write-border-color)" }}>
          <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* 옵션 체크박스 */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors">
                <input
                  type="checkbox"
                  checked={useHtml}
                  onChange={(e) => setUseHtml(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-400 text-blue-600 accent-blue-600"
                />
                HTML
              </label>
              {isLoggedIn && (
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={isSecret}
                    onChange={(e) => setIsSecret(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-400 text-blue-600 accent-blue-600"
                  />
                  비밀글
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors">
                <input
                  type="checkbox"
                  checked={isNotice}
                  onChange={(e) => setIsNotice(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-400 text-blue-600 accent-blue-600"
                />
                공지사항
              </label>

              {/* 댓글 정책 */}
              <div className="flex items-center gap-3 ml-2 pl-3 border-l border-gray-400">
                <span className="text-xs font-medium text-gray-500">댓글허용:</span>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors">
                  <input
                    type="radio"
                    name="commentPolicy"
                    value="ALLOW_EDIT"
                    checked={commentPolicy === "ALLOW_EDIT"}
                    onChange={(e) => setCommentPolicy(e.target.value)}
                    className="w-3.5 h-3.5 text-blue-600 accent-blue-600"
                  />
                  <span className="text-xs">수정추가</span>
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors">
                  <input
                    type="radio"
                    name="commentPolicy"
                    value="ALLOW"
                    checked={commentPolicy === "ALLOW"}
                    onChange={(e) => setCommentPolicy(e.target.value)}
                    className="w-3.5 h-3.5 text-blue-600 accent-blue-600"
                  />
                  <span className="text-xs">추가</span>
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors">
                  <input
                    type="radio"
                    name="commentPolicy"
                    value="DISABLED"
                    checked={commentPolicy === "DISABLED"}
                    onChange={(e) => setCommentPolicy(e.target.value)}
                    className="w-3.5 h-3.5 text-blue-600 accent-blue-600"
                  />
                  <span className="text-xs">미사용</span>
                </label>
              </div>
            </div>

            {/* 버튼 그룹 — 비로그인 시 CAPTCHA 가 취소 버튼 앞에 인라인 */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {isLoggedIn === false && (
                <CaptchaField
                  compact
                  onAnswer={(answer, token) => {
                    setCaptchaAnswer(answer);
                    setCaptchaToken(token);
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 sm:flex-initial px-5 py-2.5 text-sm font-medium border border-gray-400 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 sm:flex-initial px-7 py-2.5 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    등록 중...
                  </>
                ) : (
                  mode === "modify" ? "수정하기" : "등록하기"
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// Suspense boundary for useSearchParams
export default function WritePage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = use(params);

  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">로딩 중...</div>}>
      <WriteForm boardId={boardId} />
    </Suspense>
  );
}
