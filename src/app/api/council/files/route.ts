import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";

// 권한 확인 헬퍼
async function requireCouncilAccess(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || (!user.councilAccess && user.isAdmin > 2)) return null;
  return user;
}

// GET /api/council/files?category=report-entry&date=2026-03-15&groupId=1
export async function GET(request: NextRequest) {
  const user = await requireCouncilAccess(request);
  if (!user) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || "";
  const dateStr = searchParams.get("date") || "";
  const groupId = searchParams.get("groupId");

  if (!category || !dateStr) {
    return NextResponse.json({ message: "category, date 필수" }, { status: 400 });
  }

  const where: Record<string, unknown> = {
    category,
    refDate: new Date(dateStr + "T00:00:00+09:00"),
  };
  if (groupId) where.refGroupId = Number(groupId);

  const files = await prisma.councilFile.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    files.map((f) => ({
      id: f.id,
      origName: f.origName,
      fileName: f.fileName,
      fileSize: f.fileSize,
      createdAt: f.createdAt,
    }))
  );
}

// POST /api/council/files (FormData: category, date, groupId?, files[])
export async function POST(request: NextRequest) {
  const user = await requireCouncilAccess(request);
  if (!user) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const formData = await request.formData();
  const category = formData.get("category") as string;
  const dateStr = formData.get("date") as string;
  const groupIdStr = formData.get("groupId") as string | null;

  if (!category || !dateStr) {
    return NextResponse.json({ message: "category, date 필수" }, { status: 400 });
  }

  const refDate = new Date(dateStr + "T00:00:00+09:00");
  const refGroupId = groupIdStr ? Number(groupIdStr) : null;

  // 파일 추출 (files 키로 여러 파일)
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File && value.size > 0) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ message: "파일을 선택해 주세요." }, { status: 400 });
  }

  // 파일 크기 제한 (개당 20MB)
  for (const f of files) {
    if (f.size > 20 * 1024 * 1024) {
      return NextResponse.json({ message: `파일 "${f.name}"이 20MB를 초과합니다.` }, { status: 400 });
    }
  }

  const uploadDir = path.join(process.cwd(), "data", "council", category);
  await mkdir(uploadDir, { recursive: true });

  const saved = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = path.extname(file.name);
    const storedName = `${Date.now()}_${i}${ext}`;
    const filePath = `data/council/${category}/${storedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, storedName), buffer);

    const record = await prisma.councilFile.create({
      data: {
        category,
        refDate,
        refGroupId,
        fileName: filePath,
        origName: file.name,
        fileSize: file.size,
      },
    });
    saved.push({
      id: record.id,
      origName: record.origName,
      fileName: record.fileName,
      fileSize: record.fileSize,
      createdAt: record.createdAt,
    });
  }

  return NextResponse.json({ message: `${saved.length}개 파일 업로드 완료`, files: saved });
}

// DELETE /api/council/files?id=123
export async function DELETE(request: NextRequest) {
  const user = await requireCouncilAccess(request);
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const idParam = request.nextUrl.searchParams.get("id");
  if (!idParam) return NextResponse.json({ message: "id 필수" }, { status: 400 });

  const file = await prisma.councilFile.findUnique({ where: { id: Number(idParam) } });
  if (!file) return NextResponse.json({ message: "파일을 찾을 수 없습니다." }, { status: 404 });

  // 물리 파일 삭제
  try {
    await unlink(path.join(process.cwd(), file.fileName));
  } catch {
    // 파일이 이미 없는 경우 무시
  }

  await prisma.councilFile.delete({ where: { id: file.id } });
  return NextResponse.json({ message: "삭제되었습니다." });
}
