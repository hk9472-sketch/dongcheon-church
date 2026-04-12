import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

// POST /api/council/reading/upload - 음성 파일 업로드 (관리자)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "파일을 선택하세요" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (![".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) {
    return NextResponse.json({ error: "지원하지 않는 형식입니다 (mp3, wav, ogg, m4a)" }, { status: 400 });
  }

  // 1GB 제한
  if (file.size > 1024 * 1024 * 1024) {
    return NextResponse.json({ error: "파일 크기는 1GB 이하여야 합니다" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data", "readings");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 고유 파일명 생성 (UUID + 확장자로 충돌 방지)
  const uuid = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const fileName = `${uuid}${ext}`;
  const filePath = path.join(dir, fileName);

  // 스트림 방식으로 저장 (대용량 파일 메모리 절약)
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const audioPath = `data/readings/${fileName}`;
  return NextResponse.json({ audioPath, origName: file.name });
}
