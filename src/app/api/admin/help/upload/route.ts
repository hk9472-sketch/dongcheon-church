import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

// POST /api/admin/help/upload — 도움말 이미지 업로드
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("image") as File | null;

  if (!file || file.size === 0) {
    return NextResponse.json({ message: "파일이 없습니다." }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ message: "파일 크기는 10MB 이하만 가능합니다." }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), "data", "help");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const ext = path.extname(file.name) || ".png";
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const filePath = path.join(uploadDir, fileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // 클라이언트에서 사용할 URL 반환
  return NextResponse.json({
    url: `/api/admin/help/image/${fileName}`,
  });
}
