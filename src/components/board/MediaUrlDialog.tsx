"use client";

import { useEffect, useState } from "react";

interface MediaUrlDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fullUrl: string) => void;
}

const LS_RECENT_KEY = "mediaUrlDialog.recent";

function normalizeBase(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : trimmed + "/";
}

function combineUrl(base: string, path: string): string {
  const b = normalizeBase(base);
  const p = path.trim().replace(/^\/+/, "");
  return b + p;
}

export default function MediaUrlDialog({ open, onClose, onSubmit }: MediaUrlDialogProps) {
  const [baseUrl, setBaseUrl] = useState("");
  const [baseUrlEditable, setBaseUrlEditable] = useState(false);
  const [path, setPath] = useState("");
  const [rawMode, setRawMode] = useState(false); // 전체 URL 직접 입력
  const [rawUrl, setRawUrl] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  // 모달 열릴 때 기본 URL 가져오기 + 최근 경로 복원
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/media-base-url")
      .then((r) => r.json())
      .then((d) => {
        if (d?.url) setBaseUrl(d.url);
      })
      .catch(() => {
        /* 기본 URL 없음 */
      });
    try {
      const raw = localStorage.getItem(LS_RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {
      /* localStorage 없음 */
    }
    // 상태 초기화
    setPath("");
    setRawUrl("");
    setRawMode(false);
    setBaseUrlEditable(false);
  }, [open]);

  if (!open) return null;

  const preview = rawMode ? rawUrl.trim() : combineUrl(baseUrl, path);
  const canSubmit = preview.length > 0 && /^https?:\/\//i.test(preview);

  function handleSubmit() {
    if (!canSubmit) return;
    // 최근 경로 기록 (raw 모드 포함)
    const toRemember = rawMode ? preview : path.trim();
    if (toRemember) {
      const next = [toRemember, ...recent.filter((r) => r !== toRemember)].slice(0, 5);
      try {
        localStorage.setItem(LS_RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    onSubmit(preview);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-bold text-gray-800">미디어 URL 삽입</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="px-5 py-4 space-y-3">
          {!rawMode && (
            <>
              <div>
                <label className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">기본 URL</span>
                  <button
                    type="button"
                    onClick={() => setBaseUrlEditable((v) => !v)}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    {baseUrlEditable ? "잠금" : "편집"}
                  </button>
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  readOnly={!baseUrlEditable}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://미디어서버/경로/"
                  className={`w-full px-3 py-2 text-sm font-mono border rounded ${
                    baseUrlEditable ? "border-blue-300 bg-white" : "border-gray-200 bg-gray-50"
                  }`}
                />
                {!baseUrl && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    기본 URL 이 설정되지 않았습니다. 관리자 → 사이트 설정에서 설정할 수 있습니다.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">경로/파일명</label>
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                  autoFocus
                  placeholder="weekly/20260420.mp4"
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </>
          )}
          {rawMode && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">전체 URL</label>
              <input
                type="text"
                value={rawUrl}
                onChange={(e) => setRawUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                autoFocus
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                YouTube·Vimeo·카카오TV·네이버TV·mp4·mp3 등 외부 링크 직접 입력.
              </p>
            </div>
          )}

          {/* 미리보기 */}
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <div className="text-[10px] text-gray-500 mb-0.5">미리보기</div>
            <div className="text-xs font-mono text-gray-700 break-all">
              {preview || <span className="text-gray-400">(URL 을 입력하세요)</span>}
            </div>
          </div>

          {/* 모드 토글 */}
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rawMode}
              onChange={(e) => setRawMode(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
            />
            전체 URL 직접 입력 (기본 URL 무시)
          </label>

          {/* 최근 경로 */}
          {recent.length > 0 && !rawMode && (
            <div>
              <div className="text-[11px] text-gray-500 mb-1">최근 사용한 경로</div>
              <div className="flex flex-wrap gap-1">
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPath(r)}
                    className="px-2 py-0.5 text-[11px] font-mono bg-gray-100 hover:bg-gray-200 rounded border border-gray-200"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-white"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            삽입
          </button>
        </div>
      </div>
    </div>
  );
}
