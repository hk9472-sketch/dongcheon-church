"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 표/셀 외곽선 색상 선택기 — 16색 팔레트 + 적용 버튼.
 *
 * - 같은 색 재선택 후 [적용] 누르면 다시 적용됨 (input[type=color] 의 onChange 미발화 버그 회피)
 * - 팔레트 외 색은 우측 [직접] 컬러피커로 보충 — 선택 후 [적용] 으로 확정
 */

const PALETTE_16: { value: string; label: string }[] = [
  { value: "#000000", label: "검정" },
  { value: "#1f2937", label: "진회색" },
  { value: "#4b5563", label: "회색" },
  { value: "#9ca3af", label: "옅은회색" },
  { value: "#d1d5db", label: "연한회색 (기본)" },
  { value: "#e5e7eb", label: "더 연한회색" },
  { value: "#f3f4f6", label: "거의 흰색" },
  { value: "#ffffff", label: "흰색" },
  { value: "#dc2626", label: "빨강" },
  { value: "#ea580c", label: "주황" },
  { value: "#ca8a04", label: "노랑" },
  { value: "#16a34a", label: "초록" },
  { value: "#0891b2", label: "청록" },
  { value: "#2563eb", label: "파랑" },
  { value: "#7c3aed", label: "보라" },
  { value: "#db2777", label: "분홍" },
];

interface Props {
  label: string;
  /** 현재 적용된 색상 (있으면 swatch 에 강조) */
  current?: string | null;
  onApply: (color: string) => void;
  onReset: () => void;
  title?: string;
}

export default function TableBorderPicker({
  label,
  current,
  onApply,
  onReset,
  title,
}: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(current ?? null);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // current 가 외부에서 바뀌면 picked 동기화 (열려있지 않을 때만)
  useEffect(() => {
    if (!open) setPicked(current ?? null);
  }, [current, open]);

  const apply = () => {
    if (picked) onApply(picked);
    setOpen(false);
  };
  const reset = () => {
    setPicked(null);
    onReset();
    setOpen(false);
  };

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title || `${label} 외곽선 색상`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] border border-gray-300 rounded bg-white hover:bg-gray-50"
      >
        <span className="text-gray-600">{label}</span>
        <span
          className="inline-block w-4 h-4 rounded border border-gray-300"
          style={{ backgroundColor: current || "transparent", backgroundImage: current ? undefined : "linear-gradient(135deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)" }}
        />
        <span className="text-gray-400 text-[9px]">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-56 rounded-md border border-gray-300 bg-white shadow-lg p-2">
          <div className="text-[10px] text-gray-500 mb-1.5 px-0.5">
            {label} 외곽선 색상
          </div>
          <div className="grid grid-cols-4 gap-1">
            {PALETTE_16.map((c) => {
              const selected = picked?.toLowerCase() === c.value.toLowerCase();
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setPicked(c.value)}
                  title={c.label}
                  className={`relative w-10 h-7 rounded border ${
                    selected
                      ? "border-blue-500 ring-2 ring-blue-300"
                      : "border-gray-300 hover:border-gray-500"
                  }`}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.label}
                >
                  {selected && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-1.5 pt-2 border-t border-gray-100">
            <label className="flex items-center gap-1 text-[10px] text-gray-500">
              직접
              <input
                type="color"
                value={picked || "#000000"}
                onChange={(e) => setPicked(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border border-gray-300"
              />
            </label>
            <div className="flex-1" />
            <button
              type="button"
              onClick={reset}
              className="px-2 py-0.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              title="기본 색상으로 초기화"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!picked}
              className="px-3 py-0.5 text-[11px] text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40"
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
