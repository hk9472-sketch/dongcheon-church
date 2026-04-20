import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

const KEYS = [
  "media_ftp_host",
  "media_ftp_port",
  "media_ftp_user",
  "media_ftp_password",
  "media_ftp_remote_root",
] as const;

type Key = (typeof KEYS)[number];

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) return false;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return false;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  return !!user && user.isAdmin <= 2;
}

// GET — 관리자만. 비밀번호는 존재 여부(true/false)로만 반환해 화면에 노출 방지.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: [...KEYS] } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value || "";
  return NextResponse.json({
    host: map.media_ftp_host || "",
    port: map.media_ftp_port || "21",
    user: map.media_ftp_user || "",
    hasPassword: !!map.media_ftp_password,
    remoteRoot: map.media_ftp_remote_root || "/",
  });
}

// POST — 관리자만
// body: { host, port, user, password?, remoteRoot }
// password 를 비워서 보내면 기존 비밀번호 유지 (화면에서 ****** 유지 의도).
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const updates: Partial<Record<Key, string>> = {
    media_ftp_host: String(body.host || "").trim(),
    media_ftp_port: String(body.port || "21").trim(),
    media_ftp_user: String(body.user || "").trim(),
    media_ftp_remote_root: String(body.remoteRoot || "/").trim(),
  };
  // password 는 빈 문자열이면 기존값 유지, 새 값이 오면 덮어쓰기
  const newPw = typeof body.password === "string" ? body.password : "";
  if (newPw) updates.media_ftp_password = newPw;

  for (const [key, value] of Object.entries(updates)) {
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: value ?? "" },
      update: { value: value ?? "" },
    });
  }
  return NextResponse.json({ success: true });
}

// DELETE — FTP 설정 모두 해제 (로컬 저장 모드로 복귀)
export async function DELETE() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }
  await prisma.siteSetting.deleteMany({ where: { key: { in: [...KEYS] } } });
  return NextResponse.json({ success: true });
}
