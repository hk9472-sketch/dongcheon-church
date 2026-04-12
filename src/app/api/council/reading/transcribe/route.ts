import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

// POST /api/council/reading/transcribe - Whisper 음성→텍스트 변환
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { readingId, model = "base" } = await req.json();

  if (!["base", "small", "medium"].includes(model)) {
    return NextResponse.json({ error: "지원하지 않는 모델" }, { status: 400 });
  }

  const reading = await prisma.reading.findUnique({ where: { id: readingId } });
  if (!reading?.audioPath) {
    return NextResponse.json({ error: "음성 파일이 없습니다" }, { status: 400 });
  }

  const audioFullPath = path.join(process.cwd(), reading.audioPath);
  if (!fs.existsSync(audioFullPath)) {
    return NextResponse.json({ error: "음성 파일을 찾을 수 없습니다" }, { status: 404 });
  }

  // 임시 출력 디렉토리
  const isWindows = process.platform === "win32";
  const outDir = path.join(process.cwd(), "data", "whisper-tmp");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Windows에서 WSL 사용 시 경로를 WSL 형식으로 변환
  const toWslPath = (p: string) =>
    p.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`);

  try {
    const whisperVenv = process.env.WHISPER_VENV || "~/whisper-env";
    let cmd: string;

    if (isWindows) {
      const wslAudio = toWslPath(audioFullPath);
      const wslOut = toWslPath(outDir);

      cmd = `wsl bash -c "source ${whisperVenv}/bin/activate && whisper '${wslAudio}' --model ${model} --language ko --output_format json --output_dir '${wslOut}'"`;
    } else {
      const whisperBin = process.env.WHISPER_BIN || `${whisperVenv}/bin/whisper`;
      cmd = `${whisperBin} "${audioFullPath}" --model ${model} --language ko --output_format json --output_dir "${outDir}"`;
    }

    await execAsync(cmd, {
      timeout: 30 * 60 * 1000,
      maxBuffer: 50 * 1024 * 1024, // 50MB 버퍼
    });

    // 결과 JSON 파일 찾기
    const audioBaseName = path.basename(reading.audioPath).replace(/\.[^.]+$/, "");
    const jsonPath = path.join(outDir, `${audioBaseName}.json`);

    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({ error: "변환 결과 파일을 찾을 수 없습니다" }, { status: 500 });
    }

    const result = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const segments: { start: number; end: number; text: string }[] =
      (result.segments || []).map((s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      }));

    // 텍스트와 타임스탬프 저장
    const content = segments.map((s) => s.text).join("\n");
    const timestamps = JSON.stringify(segments);

    await prisma.reading.update({
      where: { id: readingId },
      data: { content, timestamps },
    });

    // 임시 파일 정리
    try {
      fs.unlinkSync(jsonPath);
      const txtPath = jsonPath.replace(".json", ".txt");
      if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
    } catch { /* ignore */ }

    return NextResponse.json({
      ok: true,
      segmentCount: segments.length,
      content,
      timestamps,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `변환 실패: ${message.substring(0, 200)}` },
      { status: 500 }
    );
  }
}
