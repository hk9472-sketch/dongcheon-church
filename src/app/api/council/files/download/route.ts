import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";

// GET /api/council/files/download?id=123
export async function GET(request: NextRequest) {
  // 권한 확인
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return NextResponse.json({ message: "로그인 필요" }, { status: 401 });
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return NextResponse.json({ message: "세션 만료" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || (!user.councilAccess && user.isAdmin > 2)) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  const idParam = request.nextUrl.searchParams.get("id");
  if (!idParam) return NextResponse.json({ message: "id 필수" }, { status: 400 });

  const file = await prisma.councilFile.findUnique({ where: { id: Number(idParam) } });
  if (!file) return NextResponse.json({ message: "파일을 찾을 수 없습니다." }, { status: 404 });

  try {
    const filePath = path.join(process.cwd(), file.fileName);
    const buffer = await readFile(filePath);
    const displayName = file.origName || path.basename(file.fileName);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ message: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
}
