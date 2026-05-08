"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Category {
  id: number;
  name: string;
}

interface Board {
  id: number;
  slug: string;
  title: string;
}

interface Props {
  selectedIds: number[];
  currentBoardId: number;
  currentCategories: Category[];
  useCategory: boolean;
  onDone: () => void;
}

/**
 * 게시판 관리 모드에서 선택한 글의 카테고리/게시판을 변경하는 컨트롤.
 * /api/admin/posts/bulk-move 를 재사용 — 같은 게시판 + 다른 카테고리는 카테고리만 변경,
 * 다른 게시판은 trees 단위로 이동(headnum 새로 부여) + 카테고리 지정.
 */
export default function PostManageActions({
  selectedIds,
  currentBoardId,
  currentCategories,
  useCategory,
  onDone,
}: Props) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<"none" | "cat" | "board">("none");
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 카테고리 변경 상태
  const [pickedCatId, setPickedCatId] = useState<number | "none" | "">("");

  // 게시판 이동 상태
  const [boards, setBoards] = useState<Board[]>([]);
  const [pickedBoardId, setPickedBoardId] = useState<number | "">("");
  const [targetCategories, setTargetCategories] = useState<Category[]>([]);
  const [pickedTargetCatId, setPickedTargetCatId] = useState<number | "none" | "">("");

  // 외부 클릭 닫기
  useEffect(() => {
    if (openMenu === "none") return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenMenu("none");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  // 게시판 메뉴 열 때 게시판 목록 lazy load
  useEffect(() => {
    if (openMenu !== "board" || boards.length > 0) return;
    fetch("/api/admin/boards")
      .then((r) => r.json())
      .then((d) => setBoards(Array.isArray(d) ? d : d.boards || []))
      .catch(() => {});
  }, [openMenu, boards.length]);

  // 대상 게시판 선택 시 그 게시판의 카테고리 로드
  useEffect(() => {
    if (!pickedBoardId) {
      setTargetCategories([]);
      setPickedTargetCatId("");
      return;
    }
    if (pickedBoardId === currentBoardId) {
      // 같은 게시판이면 현재 카테고리 그대로 사용
      setTargetCategories(currentCategories);
      return;
    }
    fetch(`/api/admin/boards/${pickedBoardId}`)
      .then((r) => r.json())
      .then((d) => setTargetCategories(d?.categories || []))
      .catch(() => setTargetCategories([]));
    setPickedTargetCatId("");
  }, [pickedBoardId, currentBoardId, currentCategories]);

  async function applyCategoryChange() {
    if (pickedCatId === "") {
      alert("카테고리를 선택하세요.");
      return;
    }
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}건의 카테고리를 변경할까요?`)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/posts/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postIds: selectedIds,
          targetBoardId: currentBoardId,
          targetCategoryId: pickedCatId === "none" ? null : pickedCatId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "변경 실패");
      alert(
        `${data.treeCount}개 트리(${data.movedCount}건) 카테고리 변경 완료. 백업 ID ${data.backupId}.`,
      );
      setOpenMenu("none");
      setPickedCatId("");
      onDone();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function applyBoardMove() {
    if (!pickedBoardId) {
      alert("대상 게시판을 선택하세요.");
      return;
    }
    if (pickedBoardId === currentBoardId && pickedTargetCatId === "") {
      alert("같은 게시판이라면 대상 카테고리를 명시해 주세요.");
      return;
    }
    if (selectedIds.length === 0) return;
    const isSameBoard = pickedBoardId === currentBoardId;
    const targetBoard = boards.find((b) => b.id === pickedBoardId);
    const msg = isSameBoard
      ? `선택한 ${selectedIds.length}건의 카테고리를 변경할까요?`
      : `선택한 ${selectedIds.length}건을 "${targetBoard?.title || ""}" 게시판으로 이동할까요?`;
    if (!confirm(msg)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/posts/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postIds: selectedIds,
          targetBoardId: pickedBoardId,
          targetCategoryId:
            pickedTargetCatId === "none" || pickedTargetCatId === ""
              ? null
              : pickedTargetCatId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "이동 실패");
      alert(
        data.mode === "category-change"
          ? `${data.treeCount}개 트리(${data.movedCount}건) 카테고리 변경 완료. 백업 ID ${data.backupId}.`
          : `${data.treeCount}개 트리(${data.movedCount}건)를 "${data.targetTitle}" 으로 이동 완료. 백업 ID ${data.backupId}.`,
      );
      setOpenMenu("none");
      setPickedBoardId("");
      setPickedTargetCatId("");
      onDone();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "이동 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={ref}>
      {/* 카테고리 변경 — useCategory 인 게시판에서만 의미 있음 */}
      {useCategory && currentCategories.length > 0 && (
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === "cat" ? "none" : "cat")}
          disabled={submitting}
          className="px-3 py-1 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50"
        >
          카테고리 변경 ▾
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpenMenu(openMenu === "board" ? "none" : "board")}
        disabled={submitting}
        className="px-3 py-1 text-xs border border-purple-300 text-purple-700 rounded hover:bg-purple-50"
      >
        게시판 이동 ▾
      </button>

      {openMenu === "cat" && (
        <div className="absolute z-30 top-full right-0 mt-1 w-64 rounded-md border border-gray-300 bg-white shadow-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-700">카테고리 변경</div>
          <select
            value={pickedCatId}
            onChange={(e) => {
              const v = e.target.value;
              setPickedCatId(v === "" || v === "none" ? (v as "" | "none") : Number(v));
            }}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
          >
            <option value="">선택...</option>
            <option value="none">(카테고리 없음)</option>
            {currentCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpenMenu("none")}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={applyCategoryChange}
              disabled={submitting || pickedCatId === ""}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              적용
            </button>
          </div>
        </div>
      )}

      {openMenu === "board" && (
        <div className="absolute z-30 top-full right-0 mt-1 w-72 rounded-md border border-gray-300 bg-white shadow-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-700">게시판 이동</div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">대상 게시판</label>
            <select
              value={pickedBoardId}
              onChange={(e) => setPickedBoardId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            >
              <option value="">선택...</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.slug}){b.id === currentBoardId ? " — 같은 게시판" : ""}
                </option>
              ))}
            </select>
          </div>
          {pickedBoardId !== "" && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">
                대상 카테고리 {pickedBoardId === currentBoardId && "(필수)"}
              </label>
              <select
                value={pickedTargetCatId}
                onChange={(e) => {
                  const v = e.target.value;
                  setPickedTargetCatId(v === "" || v === "none" ? (v as "" | "none") : Number(v));
                }}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                disabled={!pickedBoardId}
              >
                <option value="">선택...</option>
                <option value="none">(카테고리 없음)</option>
                {targetCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-[10px] text-gray-400 leading-relaxed">
            답글이 있는 글은 트리 전체가 함께 처리됩니다. 다른 게시판으로 이동 시 headnum 이 최신
            위치로 새로 부여됩니다.
          </p>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpenMenu("none")}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={applyBoardMove}
              disabled={submitting || !pickedBoardId}
              className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40"
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
