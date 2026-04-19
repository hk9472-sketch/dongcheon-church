"use client";

import { useState } from "react";
import { SKINS, getSkinTypeLabel } from "@/lib/skins";
import type { SkinConfig, SkinType } from "@/lib/skins";
import HelpButton from "@/components/HelpButton";

const SKIN_TYPES: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "bbs", label: "BBS 게시판" },
  { value: "gallery", label: "갤러리" },
  { value: "music", label: "음악" },
  { value: "download", label: "자료실" },
  { value: "vote", label: "투표" },
  { value: "web", label: "웹진" },
  { value: "multi", label: "멀티보드" },
];

export default function AdminSkinsPage() {
  const [filter, setFilter] = useState("all");
  const [selectedSkin, setSelectedSkin] = useState<SkinConfig | null>(null);

  const filtered = filter === "all" ? SKINS : SKINS.filter((s) => s.type === filter);

  // 유형별 카운트
  const typeCounts: Record<string, number> = { all: SKINS.length };
  SKINS.forEach((s) => {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">스킨 관리 <HelpButton slug="admin-skins" /></h1>
        <span className="text-sm text-gray-500">총 {SKINS.length}개 스킨</span>
      </div>

      {/* 유형 필터 */}
      <div className="flex flex-wrap gap-2">
        {SKIN_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => { setFilter(t.value); setSelectedSkin(null); }}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === t.value
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
            {typeCounts[t.value] !== undefined && (
              <span className="ml-1 opacity-60">({typeCounts[t.value]})</span>
            )}
          </button>
        ))}
      </div>

      {/* 스킨 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((skin) => (
          <div
            key={skin.id}
            onClick={() => setSelectedSkin(selectedSkin?.id === skin.id ? null : skin)}
            className={`bg-white rounded-lg shadow-sm border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
              selectedSkin?.id === skin.id ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
            }`}
          >
            {/* 색상 프리뷰 바 */}
            <div className="h-24 relative overflow-hidden">
              {/* 헤더 영역 */}
              <div
                className="h-8 flex items-center px-3"
                style={{ backgroundColor: skin.styles.headerBg }}
              >
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: skin.styles.primaryColor }} />
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: skin.styles.accentColor }} />
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: skin.styles.borderColor }} />
                </div>
                <span className="ml-2 text-xs" style={{ color: skin.styles.textColor }}>{skin.name}</span>
              </div>
              {/* 본문 프리뷰 */}
              <div
                className="flex-1 px-3 py-2 space-y-1"
                style={{ backgroundColor: skin.styles.bgColor }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 rounded" style={{ backgroundColor: skin.styles.primaryColor, opacity: 0.7 }} />
                  <div className="w-24 h-1.5 rounded" style={{ backgroundColor: skin.styles.borderColor }} />
                </div>
                <div className="w-full h-1 rounded" style={{ backgroundColor: skin.styles.borderColor, opacity: 0.5 }} />
                <div className="w-3/4 h-1 rounded" style={{ backgroundColor: skin.styles.borderColor, opacity: 0.3 }} />
                <div className="flex gap-1 pt-1">
                  <div className="w-8 h-3 rounded text-center" style={{ backgroundColor: skin.styles.accentColor }}>
                    <span className="text-white" style={{ fontSize: "6px" }}>버튼</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 정보 */}
            <div className="p-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-sm text-gray-800">{skin.name}</h3>
                <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500">
                  {getSkinTypeLabel(skin.type)}
                </span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{skin.description}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">by {skin.author}</span>
                <div className="flex gap-1">
                  {skin.supportedBoards.map((b) => (
                    <span key={b} className="px-1 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 선택된 스킨 상세 */}
      {selectedSkin && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">{selectedSkin.name} — 상세 정보</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <span className="text-xs font-medium text-gray-500">스킨 ID</span>
                <p className="font-mono text-sm text-gray-800">{selectedSkin.id}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">설명</span>
                <p className="text-sm text-gray-700">{selectedSkin.description}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">제작자</span>
                <p className="text-sm text-gray-700">{selectedSkin.author}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">유형</span>
                <p className="text-sm text-gray-700">{getSkinTypeLabel(selectedSkin.type)}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">지원 게시판</span>
                <div className="flex gap-2 mt-1">
                  {selectedSkin.supportedBoards.map((b) => (
                    <span key={b} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">{b}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* 색상 팔레트 */}
            <div>
              <span className="text-xs font-medium text-gray-500">색상 팔레트</span>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(selectedSkin.styles).filter(([, v]) => typeof v === "string" && v.startsWith("#")).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded border border-gray-300" style={{ backgroundColor: val as string }} />
                    <div>
                      <p className="text-xs text-gray-700">{key}</p>
                      <p className="text-xs text-gray-400 font-mono">{val}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <span className="text-xs text-gray-400">폰트: {selectedSkin.styles.fontFamily}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400">모서리: {selectedSkin.styles.borderRadius}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
