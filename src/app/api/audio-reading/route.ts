import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";
import { getUploadDir, getRelUploadPath } from "@/lib/uploadPath";

interface Paragraph {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * 본문 텍스트를 문단 배열로 분할.
 * 빈 줄(연속 줄바꿈) 기준. 빈 줄이 없으면 단일 줄바꿈으로도 분할.
 */
function splitParagraphs(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  let parts = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    parts = trimmed.split(/\n/).map((p) => p.trim()).filter(Boolean);
  }
  return parts;
}

/**
 * 텍스트 길이(글자 수)에 비례해서 시간 할당.
 * 균등 분할보다 정확 — 긴 문단은 더 오래, 짧은 문단은 더 짧게.
 * 길이 0 인 빈 텍스트는 비례 분모에서 제외하지만, 최소 1글자로 처리해 0 길이 회피.
 */
function buildWeightedParagraphs(texts: string[], durationMs: number): Paragraph[] {
  if (texts.length === 0) return [];
  if (durationMs <= 0) {
    return texts.map((t) => ({ text: t, startMs: 0, endMs: 0 }));
  }
  const weights = texts.map((t) => Math.max(1, t.trim().length));
  const total = weights.reduce((s, w) => s + w, 0);
  let cursor = 0;
  return texts.map((t, i) => {
    const dur = Math.floor((durationMs * weights[i]) / total);
    const startMs = cursor;
    const endMs = i === texts.length - 1 ? durationMs : cursor + dur;
    cursor = endMs;
    return { text: t, startMs, endMs };
  });
}

const ALLOWED_AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".ogg"]);
const MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100MB

/** GET — 목록 */
export async function GET() {
  const me = await getCouncilUser();
  if (!me) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }
  const list = await prisma.readingSession.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      durationMs: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ list });
}

/** POST — 신규 세션 생성 (multipart/form-data)
 *   - title: string
 *   - content: string  (본문 — paragraphs 자동 분할)
 *   - audio: File      (mp3 등)
 *   - durationMs: string  (클라이언트에서 audio 메타 읽고 전달)
 */
export async function POST(req: NextRequest) {
  const me = await getCouncilUser();
  if (!me) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }

  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const content = String(form.get("content") || "");
  const durationMs = parseInt(String(form.get("durationMs") || "0"), 10) || 0;
  const audio = form.get("audio");
  // peaks JSON 문자열 — 클라이언트에서 WebAudio 로 추출한 파형 샘플 배열.
  // 형식: number[] (각 샘플 -1~1). 길이는 보통 1000~2000.
  const peaksRaw = String(form.get("peaks") || "");
  let peaksJson: number[] | null = null;
  if (peaksRaw) {
    try {
      const parsed = JSON.parse(peaksRaw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 8000) {
        peaksJson = parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      }
    } catch {}
  }

  if (!title) {
    return NextResponse.json({ message: "제목을 입력하세요." }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ message: "본문을 입력하세요." }, { status: 400 });
  }
  if (!(audio instanceof File)) {
    return NextResponse.json({ message: "음성 파일을 업로드하세요." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_SIZE) {
    return NextResponse.json({ message: "음성 파일이 너무 큽니다 (최대 100MB)." }, { status: 400 });
  }
  const ext = path.extname(audio.name).toLowerCase();
  if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
    return NextResponse.json({ message: `허용되지 않는 음성 형식: ${ext}` }, { status: 400 });
  }

  // 디스크 저장
  const subPath = "audio-reading";
  const uploadDir = getUploadDir(subPath);
  await mkdir(uploadDir, { recursive: true });
  const stored = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const absFile = path.normalize([uploadDir, stored].join(path.sep));
  const buf = Buffer.from(await audio.arrayBuffer());
  await writeFile(absFile, buf);
  const audioPath = getRelUploadPath(subPath, stored);

  // 문단 분할 + 텍스트 길이 가중 시간 부여
  const texts = splitParagraphs(content);
  const paragraphs = buildWeightedParagraphs(texts, durationMs);

  const session = await prisma.readingSession.create({
    data: {
      title,
      audioPath,
      durationMs,
      paragraphs: paragraphs as unknown as object,
      peaksJson: peaksJson as unknown as object,
      createdBy: me.id,
    },
  });

  return NextResponse.json({ id: session.id });
}
