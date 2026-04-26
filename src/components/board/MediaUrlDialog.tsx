"use client";

import { useEffect, useState } from "react";

// 통합 미디어 삽입 다이얼로그.
// 두 가지 방식 지원:
//   1) 파일 업로드 — 첨부파일 dropzone 처럼 작동. 기준일자(yyyy-mm-dd)로 폴더 결정.
//      → onUpload(file, dateBase) 콜백. 부모(TipTapEditor)가 실시간 모드로 업로드 + 진행률 표시.
//   2) URL 입력 — 기존 base+path 또는 raw URL. 외부 YouTube/Vimeo/mp4 등.
//      → onSubmit(url) 콜백.

interface MediaUrlDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fullUrl: string) => void;
  onUpload?: (file: File, dateBase: string) => Promise<void>;
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

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Mode = "upload" | "url";

export default function MediaUrlDialog({ open, onClose, onSubmit, onUpload }: MediaUrlDialogProps) {
  const [mode, setMode] = useState<Mode>(onUpload ? "upload" : "url");
  const [dateBase, setDateBase] = useState<string>(todayIso());
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [baseUrl, setBaseUrl] = useState("");
  const [baseUrlEditable, setBaseUrlEditable] = useState(false);
  const [path, setPath] = useState("");
  const [rawMode, setRawMode] = useState(false);
  const [rawUrl, setRawUrl] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/media-base-url")
      .then((r) => r.json())
      .then((d) => {
        if (d?.url) setBaseUrl(d.url);
      })
      .catch(() => {});
    try {
      const raw = localStorage.getItem(LS_RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
    setMode(onUpload ? "upload" : "url");
    setDateBase(todayIso());
    setFile(null);
    setDragOver(false);
    setPath("");
    setRawUrl("");
    setRawMode(false);
    setBaseUrlEditable(false);
  }, [open, onUpload]);

  if (!open) return null;

  const urlPreview = rawMode ? rawUrl.trim() : combineUrl(baseUrl, path);
  const canSubmitUrl = urlPreview.length > 0 && /^https?:\/\//i.test(urlPreview);
  const canSubmitUpload = file !== null && /^\d{4}-\d{2}-\d{2}$/.test(dateBase);

  function handleSubmitUrl() {
    if (!canSubmitUrl) return;
    const toRemember = rawMode ? urlPreview : path.trim();
    if (toRemember) {
      const next = [toRemember, ...recent.filter((r) => r !== toRemember)].slice(0, 5);
      try {
        localStorage.setItem(LS_RECENT_KEY, JSON.stringify(next));
      } catch {}
    }
    onSubmit(urlPreview);
    onClose();
  }

  async function handleSubmitUpload() {
    if (!canSubmitUpload || !file || !onUpload) return;
    onClose();
    // onClose 후 진행률 모달은 부모에서 자체 표시
    await onUpload(file, dateBase);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-bold text-gray-800">미디어 삽입</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 모드 탭 */}
        {onUpload && (
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                mode === "upload"
                  ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50/50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              📤 파일 업로드
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                mode === "url"
                  ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50/50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              🔗 URL 입력
            </button>
          </div>
        )}

        {/* 본문 */}
        <div className="px-5 py-4 space-y-3">
          {mode === "upload" && (
            <>
              {/* 기준일자 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  기준일자 (등록일자)
                  <span className="ml-1 text-[11px] text-gray-400">— 이 날짜의 YYYY/MM 폴더로 저장됨</span>
                </label>
                <input
                  type="date"
                  value={dateBase}
                  onChange={(e) => setDateBase(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              {/* dropzone */}
              <label
                className={`block px-4 py-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  dragOver
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files;
                  if (dropped && dropped.length > 0) {
                    const f = dropped[0];
                    if (f.type.startsWith("video/") || f.type.startsWith("audio/")) {
                      setFile(f);
                    } else {
                      alert("동영상 또는 음성 파일만 업로드할 수 있습니다.");
                    }
                  }
                }}
              >
                <div className="text-center">
                  {file ? (
                    <>
                      <div className="text-3xl mb-2">🎬</div>
                      <div className="text-sm font-medium text-gray-800 break-all">{file.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type || "unknown"}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setFile(null);
                        }}
                        className="mt-2 text-xs text-red-500 hover:text-red-700 hover:underline"
                      >
                        제거
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl mb-2 text-gray-400">📁</div>
                      <div className="text-sm text-gray-600">클릭 또는 드래그해서 파일 선택</div>
                      <div className="text-xs text-gray-400 mt-1">동영상 (mp4·webm·mov) / 음성 (mp3·wav·m4a)</div>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </>
          )}

          {mode === "url" && (
            <>
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
                        if (e.key === "Enter") handleSubmitUrl();
                      }}
                      autoFocus
                      placeholder="2026/05/260525-주일.mp4"
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
                      if (e.key === "Enter") handleSubmitUrl();
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
                  {urlPreview || <span className="text-gray-400">(URL 을 입력하세요)</span>}
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
            </>
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
          {mode === "upload" ? (
            <button
              type="button"
              onClick={handleSubmitUpload}
              disabled={!canSubmitUpload}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              업로드 + 삽입
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmitUrl}
              disabled={!canSubmitUrl}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              삽입
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
