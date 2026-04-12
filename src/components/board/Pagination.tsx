"use client";

import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  startPage: number;
  endPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  baseUrl: string;
  queryString: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  startPage,
  endPage,
  hasPrev,
  hasNext,
  baseUrl,
  queryString,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  function pageUrl(page: number) {
    return `${baseUrl}?page=${page}${queryString}`;
  }

  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  return (
    <nav className="flex items-center justify-center gap-1 py-6 select-none">
      {hasPrev && (
        <>
          <Link
            href={pageUrl(1)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
          >
            1
          </Link>
          <span className="text-gray-400 text-xs px-1">..</span>
          <Link
            href={pageUrl(startPage - 1)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
          >
            &laquo;
          </Link>
        </>
      )}

      {currentPage > 1 && (
        <Link
          href={pageUrl(currentPage - 1)}
          className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
        >
          &lsaquo;
        </Link>
      )}

      {pages.map((p) => (
        <Link
          key={p}
          href={pageUrl(p)}
          className={`px-3 py-1.5 text-sm border rounded transition-colors ${
            p === currentPage
              ? "bg-blue-700 text-white border-blue-700 font-bold"
              : "border-gray-300 text-gray-700 hover:bg-gray-100"
          }`}
        >
          {p}
        </Link>
      ))}

      {currentPage < totalPages && (
        <Link
          href={pageUrl(currentPage + 1)}
          className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
        >
          &rsaquo;
        </Link>
      )}

      {hasNext && (
        <>
          <Link
            href={pageUrl(endPage + 1)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
          >
            &raquo;
          </Link>
          <span className="text-gray-400 text-xs px-1">..</span>
          <Link
            href={pageUrl(totalPages)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
          >
            {totalPages}
          </Link>
        </>
      )}
    </nav>
  );
}
