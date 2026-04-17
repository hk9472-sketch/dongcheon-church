"use client";

import { useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

interface HelpButtonProps {
  slug: string;
}

export default function HelpButton({ slug }: HelpButtonProps) {
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
      <button
        onClick={handleOpen}
        className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors"
        title="도움말"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col"
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
                  className="prose prose-sm max-w-none prose-img:rounded-lg prose-img:shadow-md prose-img:mx-auto prose-h2:text-blue-800 prose-h3:text-gray-700"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.content) }}
                />
              )}
            </div>

            {/* 푸터 */}
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end shrink-0">
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
