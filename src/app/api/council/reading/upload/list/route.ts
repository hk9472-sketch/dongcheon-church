import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

// GET /api/council/reading/upload/list — 관리자
// data/readings 디렉터리의 음성 파일 목록 + 매핑된 reading 정보 반환.
// orphan(어느 reading 에도 연결 안 된 파일) 표시 — 수정 폼에서 매핑할 때 사용.

interface FileEntry {
  fileName: string;
  audioPath: string;        // "data/readings/xxx.mp3"
  size: number;
  mtime: number;            // ms
  linkedReadingId: number | null;
  linkedReadingTitle: string | null;
}

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const dir = path.join(process.cwd(), "data", "readings");
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ files: [] });
  }

  const allReadings = await prisma.reading.findMany({
    where: { audioPath: { not: null } },
    select: { id: true, title: true, audioPath: true },
  });
  const pathToReading = new Map<string, { id: number; title: string }>();
  for (const r of allReadings) {
    if (r.audioPath) pathToReading.set(r.audioPath, { id: r.id, title: r.title });
  }

  const fileNames = fs.readdirSync(dir).filter((f) =>
    /\.(mp3|wav|ogg|m4a)$/i.test(f)
  );

  const files: FileEntry[] = fileNames.map((fileName) => {
    const audioPath = `data/readings/${fileName}`;
    const stat = fs.statSync(path.join(dir, fileName));
    const linked = pathToReading.get(audioPath) ?? null;
    return {
      fileName,
      audioPath,
      size: stat.size,
      mtime: stat.mtimeMs,
      linkedReadingId: linked?.id ?? null,
      linkedReadingTitle: linked?.title ?? null,
    };
  });

  // 최신 파일 먼저
  files.sort((a, b) => b.mtime - a.mtime);

  return NextResponse.json({ files });
}
