"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface SearchBarProps {
  boardSlug: string;
  currentKeyword?: string;
  currentSn?: string;
  currentSs?: string;
  currentSc?: string;
}

export default function SearchBar({
  boardSlug,
  currentKeyword = "",
  currentSn = "off",
  currentSs = "on",
  currentSc = "on",
}: SearchBarProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(currentKeyword);
  const [sn, setSn] = useState(currentSn === "on");
  const [ss, setSs] = useState(currentSs !== "off");
  const [sc, setSc] = useState(currentSc !== "off");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    const params = new URLSearchParams();
    params.set("keyword", keyword.trim());
    if (sn) params.set("sn", "on");
    if (ss) params.set("ss", "on");
    if (sc) params.set("sc", "on");

    router.push(`/board/${boardSlug}?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={sn}
            onChange={(e) => setSn(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          이름
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={ss}
            onChange={(e) => setSs(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          제목
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={sc}
            onChange={(e) => setSc(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          내용
        </label>
      </div>

      <div className="flex">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="검색어 입력"
          className="w-44 px-3 py-1.5 text-sm border border-gray-300 rounded-l focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-1.5 text-sm bg-gray-700 text-white rounded-r hover:bg-gray-800 transition-colors"
        >
          검색
        </button>
      </div>
    </form>
  );
}
