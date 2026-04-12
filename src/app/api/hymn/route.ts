import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

const CATEGORY_ORDER: Record<string, number> = { hymn: 0, gospel: 1, etc: 2 };

// GET /api/hymn — 찬송가 목록
export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q") || "";
  const cat = request.nextUrl.searchParams.get("category") || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [];

  if (keyword) {
    conditions.push({
      OR: [
        { title: { contains: keyword } },
        ...(isNaN(Number(keyword)) ? [] : [{ number: Number(keyword) }]),
      ],
    });
  }

  if (cat) {
    conditions.push({ category: cat });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const hymns = await prisma.hymn.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
  });

  // 카테고리 순서 정렬: hymn → gospel → etc
  hymns.sort((a, b) => {
    const ca = CATEGORY_ORDER[a.category] ?? 9;
    const cb = CATEGORY_ORDER[b.category] ?? 9;
    if (ca !== cb) return ca - cb;
    return a.number - b.number;
  });

  return NextResponse.json(hymns);
}

// POST /api/hymn — 찬송가 추가/수정 (관리자, FormData)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const formData = await request.formData();
  const idStr = formData.get("id") as string | null;
  const numberStr = formData.get("number") as string;
  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as string) || "hymn";
  const audioFile = formData.get("audio") as File | null;

  const number = parseInt(numberStr, 10);
  if (!number || !title) {
    return NextResponse.json({ error: "번호와 곡명이 필요합니다." }, { status: 400 });
  }

  // 음성 파일 저장
  let savedFileName: string | undefined;
  if (audioFile && audioFile.size > 0) {
    const hymnsDir = path.join(process.cwd(), "data", "hymns");
    if (!fs.existsSync(hymnsDir)) {
      fs.mkdirSync(hymnsDir, { recursive: true });
    }

    // 파일명: 카테고리_번호.mp3 (찬송가는 기존 호환을 위해 번호만)
    const ext = path.extname(audioFile.name) || ".mp3";
    savedFileName = category === "hymn" ? `${number}${ext}` : `${category}_${number}${ext}`;

    const filePath = path.join(hymnsDir, savedFileName);
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
  }

  if (idStr) {
    // 수정
    const id = parseInt(idStr, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { number, title, category };
    if (savedFileName) updateData.audioFile = savedFileName;

    const result = await prisma.hymn.update({ where: { id }, data: updateData });
    return NextResponse.json(result);
  }

  // 추가 - 카테고리+번호 중복 체크
  const existing = await prisma.hymn.findUnique({
    where: { category_number: { category, number } },
  });
  if (existing) {
    const catLabel = category === "hymn" ? "찬송가" : category === "gospel" ? "복음성가" : "기타";
    return NextResponse.json({ error: `${catLabel} ${number}번이 이미 존재합니다.` }, { status: 400 });
  }

  const result = await prisma.hymn.create({
    data: {
      category,
      number,
      title,
      audioFile: savedFileName || (category === "hymn" ? undefined : `${category}_${number}.mp3`),
      sortOrder: number,
    },
  });
  return NextResponse.json(result);
}

// DELETE /api/hymn — 찬송가 삭제 (관리자)
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body as { id: number };

  if (!id) {
    return NextResponse.json({ error: "id 필수" }, { status: 400 });
  }

  await prisma.hymn.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
