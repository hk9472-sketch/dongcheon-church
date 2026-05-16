import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getUploadDir, getRelUploadPath } from "@/lib/uploadPath";
import { listActive } from "@/lib/activePresence";
import { sendChatNotificationEmail } from "@/lib/email";

const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf", ".hwp", ".hwpx", ".doc", ".docx",
  ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".txt", ".mp3", ".mp4",
]);
const MAX_ATTACH_SIZE = 10 * 1024 * 1024;
const MAX_RECIPIENTS = 200; // 한 번에 200명 이하

/**
 * POST /api/chat/bulk — 선택한 회원 다수에게 동일 메시지 발송.
 * 관리자(isAdmin <= 2) 만 가능. multipart/form-data.
 * fields: userIds (CSV 또는 JSON), content, attach (File)
 *   - 각 수신자에게 별개 ChatMessage row 생성 (1:1 형태로 저장).
 *   - 비접속 회원은 이메일 알림 발송.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`chat-bulk:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ message: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return NextResponse.json({ message: "로그인 필요" }, { status: 401 });
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) {
    return NextResponse.json({ message: "로그인 필요" }, { status: 401 });
  }
  const sender = await prisma.user.findUnique({
    where: { id: s.userId },
    select: { id: true, name: true, isAdmin: true },
  });
  if (!sender || sender.isAdmin > 2) {
    return NextResponse.json({ message: "관리자 권한 필요" }, { status: 403 });
  }

  const form = await req.formData();
  const userIdsRaw = String(form.get("userIds") || "");
  const content = String(form.get("content") || "").trim();
  const attachFile = form.get("attach");

  // userIds 파싱 — JSON array 또는 CSV
  let userIds: number[] = [];
  try {
    if (userIdsRaw.startsWith("[")) {
      userIds = (JSON.parse(userIdsRaw) as unknown[])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n));
    } else {
      userIds = userIdsRaw
        .split(",")
        .map((v) => parseInt(v.trim(), 10))
        .filter((n) => Number.isFinite(n));
    }
  } catch {
    return NextResponse.json({ message: "userIds 형식 오류" }, { status: 400 });
  }
  userIds = Array.from(new Set(userIds));
  if (userIds.length === 0) {
    return NextResponse.json({ message: "수신자를 선택하세요." }, { status: 400 });
  }
  if (userIds.length > MAX_RECIPIENTS) {
    return NextResponse.json({ message: `최대 ${MAX_RECIPIENTS}명까지` }, { status: 400 });
  }
  if (!content && !(attachFile instanceof File)) {
    return NextResponse.json({ message: "내용 또는 파일이 필요합니다." }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ message: "내용이 너무 깁니다." }, { status: 400 });
  }

  // 첨부 한 번만 업로드 → 모든 수신자 row 가 동일 attachPath 참조
  let attachPath: string | null = null;
  let attachName: string | null = null;
  if (attachFile instanceof File) {
    if (attachFile.size > MAX_ATTACH_SIZE) {
      return NextResponse.json({ message: "파일이 너무 큽니다 (최대 10MB)." }, { status: 400 });
    }
    const ext = path.extname(attachFile.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ message: `허용되지 않는 형식: ${ext}` }, { status: 400 });
    }
    const sub = "chat";
    const dir = getUploadDir(sub);
    await mkdir(dir, { recursive: true });
    const stored = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const abs = path.normalize([dir, stored].join(path.sep));
    const buf = Buffer.from(await attachFile.arrayBuffer());
    await writeFile(abs, buf);
    attachPath = getRelUploadPath(sub, stored);
    attachName = attachFile.name.slice(0, 255);
  }

  // 수신자 검증 (존재하는 회원만)
  const validUsers = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, emailVerified: true },
  });
  if (validUsers.length === 0) {
    return NextResponse.json({ message: "유효한 수신자가 없습니다." }, { status: 400 });
  }

  const now = new Date();
  await prisma.chatMessage.createMany({
    data: validUsers.map((u) => ({
      fromUserId: sender.id,
      fromName: sender.name,
      toUserId: u.id,
      content,
      attachPath,
      attachName,
      createdAt: now,
    })),
  });

  // 비활성 회원에게 이메일 알림 (비동기)
  const activeIds = new Set(listActive().filter((r) => r.userId).map((r) => r.userId!));
  for (const u of validUsers) {
    if (u.email && u.emailVerified && !activeIds.has(u.id)) {
      sendChatNotificationEmail(u.email, u.name, sender.name, content, !!attachPath)
        .catch((e) => console.error("[chat bulk email]", u.id, e));
    }
  }

  return NextResponse.json({
    ok: true,
    sent: validUsers.length,
    requested: userIds.length,
  });
}
