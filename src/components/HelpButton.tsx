"use client";

import { useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

interface HelpButtonProps {
  slug: string;
  /** 지정하면 "?" 대신 글자 버튼으로 표시 (예: 공통 매뉴얼 바로가기) */
  label?: string;
}

export default function HelpButton({ slug, label }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    if (content) return; // 이미 로드됨

    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/admin/help?slug=${slug}`);
      if (res.ok) {
        const data = await res.json();
        setContent({ title: data.title, content: data.content });
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  };

  return (
    <>
      {label ? (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors print:hidden"
          title={`${label} 열기`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors print:hidden"
          title="도움말"
        >
          ?
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-[998px] mx-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-bold text-gray-800">
                {loading ? "불러오는 중..." : content ? content.title : "도움말"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading && (
                <div className="py-12 text-center text-gray-400">도움말을 불러오는 중...</div>
              )}
              {notFound && (
                <div className="py-12 text-center text-gray-400">
                  <p className="text-lg mb-2">등록된 도움말이 없습니다.</p>
                  <p className="text-sm">관리자가 아직 이 페이지의 도움말을 작성하지 않았습니다.</p>
                </div>
              )}
              {content && (
                <div
                  className="prose help-content max-w-none"
                  style={{ fontSize: "1.05rem" }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.content) }}
                />
              )}
            </div>

            {/* 푸터 */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
              {content ? (
                <a
                  href={`/manual/${slug}`}
                  target="_blank"
                  rel="noopener"
                  className="text-sm text-blue-600 hover:underline"
                >
                  새 창에서 크게 보기 · 인쇄
                </a>
              ) : (
                <span />
              )}
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
