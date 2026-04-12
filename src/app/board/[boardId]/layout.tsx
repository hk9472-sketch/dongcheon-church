import prisma from "@/lib/db";
import { getSkinById } from "@/lib/skins";
import SkinProvider from "@/components/board/SkinProvider";

// ============================================================
// 게시판 레이아웃 — 스킨 자동 적용
// /board/[boardId]/* 하위 모든 페이지에 적용
// ============================================================

interface LayoutProps {
  params: Promise<{ boardId: string }>;
  children: React.ReactNode;
}

export default async function BoardLayout({ params, children }: LayoutProps) {
  const { boardId } = await params;

  // 게시판 설정에서 스킨 조회
  const board = await prisma.board.findUnique({
    where: { slug: boardId },
    select: { skinName: true },
  });

  const skin = board?.skinName ? getSkinById(board.skinName) ?? null : null;

  return <SkinProvider skin={skin}>{children}</SkinProvider>;
}
