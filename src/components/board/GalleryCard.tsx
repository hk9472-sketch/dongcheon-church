"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

interface Props {
  href: string;
  thumbSrc: string | null;
  subject: string;
  authorName: string;
  createdAtLabel: string;
  hit: number;
  vote: number;
  totalComment: number;
  /** 호버 툴팁용 본문 텍스트 (HTML 제거 + 200자 컷). 비어있으면 툴팁 안 뜸 */
  contentSnippet?: string;
  /** 한 글에 이미지가 여러 장인 경우 — 1-based 현재 인덱스 / 총 개수 (없으면 표시 안 함) */
  imageIndex?: number;
  imageTotal?: number;
}

export default function GalleryCard({
  href,
  thumbSrc,
  subject,
  authorName,
  createdAtLabel,
  hit,
  vote,
  totalComment,
  contentSnippet,
  imageIndex,
  imageTotal,
}: Props) {
  const showIdxBadge = imageIndex && imageTotal && imageTotal > 1;
  const [hover, setHover] = useState(false);
  const showTooltip = hover && !!contentSnippet;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Link
        href={href}
        className="group block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-300 transition-all skin-gallery-card"
      >
        {/* 썸네일 영역 */}
        <div className="aspect-square bg-gray-100 relative overflow-hidden">
          {thumbSrc ? (
            <Image
              src={thumbSrc}
              alt={subject}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                />
              </svg>
            </div>
          )}
          {/* 좌상단: 한 글에 이미지 여러 장이면 인덱스 뱃지 */}
          {showIdxBadge && (
            <span
              className="absolute top-2 left-2 px-1.5 py-0.5 text-xs font-medium bg-black/60 text-white rounded"
              title="같은 글의 이미지"
            >
              {imageIndex} / {imageTotal}
            </span>
          )}
          {/* 우상단: 댓글 수 뱃지 */}
          {totalComment > 0 && (
            <span className="absolute top-2 right-2 px-1.5 py-0.5 text-xs font-bold bg-orange-500 text-white rounded">
              {totalComment}
            </span>
          )}
        </div>

        {/* 정보 */}
        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">
            {subject}
          </h3>
          <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
            <span>{authorName}</span>
            <span>{createdAtLabel}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>조회 {hit}</span>
            {vote > 0 && <span>추천 {vote}</span>}
          </div>
        </div>
      </Link>

      {/* 호버 툴팁 — 본문 미리보기 */}
      {showTooltip && (
        <div
          className="pointer-events-none absolute z-30 left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-[260px] max-w-[90vw] rounded-md border border-gray-300 bg-white shadow-xl p-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words"
          role="tooltip"
        >
          <p className="font-semibold text-gray-800 mb-1.5 line-clamp-1">
            {subject}
          </p>
          <p className="text-gray-600">{contentSnippet}</p>
          <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-300" />
          <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-white -mt-px" />
        </div>
      )}
    </div>
  );
}
