import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import defaultFonts from "@/config/editor-fonts-default.json";

type Font = { label: string; value: string };

function sanitize(arr: unknown): Font[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (f): f is Font =>
        !!f &&
        typeof (f as Font).label === "string" &&
        typeof (f as Font).value === "string" &&
        (f as Font).label.trim().length > 0 &&
        (f as Font).value.trim().length > 0
    )
    .map((f) => ({ label: f.label.trim(), value: f.value.trim() }));
}

// GET /api/editor-fonts
//
// 에디터(TipTapEditor) 가 마운트 시 호출하는 공개 엔드포인트.
// 우선순위:
//   1) SiteSetting.editor_fonts 에 배열이 저장돼 있으면 그 값
//   2) 비어 있거나 없으면 번들 JSON(src/config/editor-fonts-default.json) 반환
//      — 초기 배포 직후에도 별도 seed 없이 자동으로 기본 목록이 전달됨
//   3) JSON 파싱 오류 등 예외 상황에서도 번들 JSON 을 폴백
export async function GET() {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: "editor_fonts" } });
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      const fonts = sanitize(parsed);
      if (fonts.length > 0) return NextResponse.json({ fonts });
    }
    return NextResponse.json({ fonts: sanitize(defaultFonts) });
  } catch {
    return NextResponse.json({ fonts: sanitize(defaultFonts) });
  }
}
