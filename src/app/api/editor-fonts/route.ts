import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/editor-fonts
//
// 에디터(TipTapEditor) 가 마운트 시 불러오는 공개 엔드포인트.
// SiteSetting.editor_fonts 에 JSON 배열 문자열로 저장된 값 반환.
// 비어 있거나 파싱 실패면 빈 배열을 돌려줘 클라이언트가 내장 기본값을 쓰도록 함.
export async function GET() {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: "editor_fonts" } });
    if (!row?.value) return NextResponse.json({ fonts: [] });

    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return NextResponse.json({ fonts: [] });

    // 저장 포맷 방어: label/value 모두 string 이고 비어 있지 않은 항목만 통과.
    const fonts = parsed
      .filter(
        (f): f is { label: string; value: string } =>
          f &&
          typeof f.label === "string" &&
          typeof f.value === "string" &&
          f.label.trim().length > 0 &&
          f.value.trim().length > 0
      )
      .map((f) => ({ label: f.label.trim(), value: f.value.trim() }));

    return NextResponse.json({ fonts });
  } catch {
    return NextResponse.json({ fonts: [] });
  }
}
