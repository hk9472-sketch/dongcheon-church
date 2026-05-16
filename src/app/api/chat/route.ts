import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getUploadDir, getRelUploadPath } from "@/lib/uploadPath";
import { listActive } from "@/lib/activePresence";
import { sendChatNotificationEmail } from "@/lib/email";

// 파일 첨부 화이트리스트 (게시판 write 와 동일 정책 적용 — 사용자 친숙)
const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf", ".hwp", ".hwpx", ".doc", ".docx",
  ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".txt", ".mp3", ".mp4",
]);
const MAX_ATTACH_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 발신자 식별 — dc_session 쿠키 우선, 없으면 fromGuest (sessionId).
 */
async function resolveSender(body: { fromGuest?: string; fromName?: string }) {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (token) {
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    if (s && s.expires > new Date()) {
      const u = await prisma.user.findUnique({
        where: { id: s.userId },
        select: { id: true, name: true, isAdmin: true },
      });
      if (u) return { userId: u.id, guest: null, name: u.name, isAdmin: u.isAdmin };
    }
  }
  const guest = String(body?.fromGuest || "").slice(0, 64);
  if (!guest) return null;
  const name = String(body?.fromName || "방문자").slice(0, 50);
  return { userId: null, guest, name, isAdmin: 99 };
}

/**
 * POST /api/chat — 메시지 발송 (JSON 또는 multipart/form-data)
 *
 * JSON  body: { toUserId?, toGuest?, toBroadcast?, content, fromGuest?, fromName? }
 * Form fields: toUserId?, toGuest?, toBroadcast?, content, fromGuest?, fromName?, attach (File)
 *
 *   - 발신자: 로그인 사용자 우선, 없으면 fromGuest
 *   - 수신자: toUserId XOR toGuest XOR toBroadcast (전체 발송은 최고관리자만)
 *   - 첨부: 10MB 이하, 화이트리스트 확장자만
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`chat-send:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ message: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const ct = req.headers.get("content-type") || "";
  const isMultipart = ct.includes("multipart/form-data");

  let body: Record<string, string> = {};
  let attach: File | null = null;
  if (isMultipart) {
    const form = await req.formData();
    for (const [k, v] of form.entries()) {
      if (v instanceof File) attach = v;
      else body[k] = String(v);
    }
  } else {
    body = await req.json().catch(() => ({}));
  }

  const sender = await resolveSender(body);
  if (!sender) {
    return NextResponse.json({ message: "발신자 식별 실패" }, { status: 400 });
  }

  const toUserId = body.toUserId ? Number(body.toUserId) : null;
  const toGuest = body.toGuest ? String(body.toGuest).slice(0, 64) : null;
  const toBroadcast = String(body.toBroadcast || "").toLowerCase() === "true";
  const content = String(body.content || "").trim();

  const targets = [toUserId, toGuest, toBroadcast].filter(Boolean).length;
  if (targets === 0) {
    return NextResponse.json({ message: "수신자가 필요합니다." }, { status: 400 });
  }
  if (targets > 1) {
    return NextResponse.json({ message: "수신자는 하나만 지정" }, { status: 400 });
  }
  if (toBroadcast && sender.isAdmin > 2) {
    return NextResponse.json({ message: "전체 발송은 관리자만 가능합니다." }, { status: 403 });
  }
  if (!content && !attach) {
    return NextResponse.json({ message: "내용 또는 파일을 첨부하세요." }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ message: "내용이 너무 깁니다." }, { status: 400 });
  }

  // 첨부 처리
  let attachPath: string | null = null;
  let attachName: string | null = null;
  if (attach) {
    if (attach.size > MAX_ATTACH_SIZE) {
      return NextResponse.json({ message: "파일이 너무 큽니다 (최대 10MB)." }, { status: 400 });
    }
    const ext = path.extname(attach.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ message: `허용되지 않는 파일 형식: ${ext}` }, { status: 400 });
    }
    const sub = "chat";
    const dir = getUploadDir(sub);
    await mkdir(dir, { recursive: true });
    const stored = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const abs = path.normalize([dir, stored].join(path.sep));
    const buf = Buffer.from(await attach.arrayBuffer());
    await writeFile(abs, buf);
    attachPath = getRelUploadPath(sub, stored);
    attachName = attach.name.slice(0, 255);
  }

  const created = await prisma.chatMessage.create({
    data: {
      fromUserId: sender.userId,
      fromGuest: sender.guest,
      fromName: sender.name,
      toUserId,
      toGuest,
      toBroadcast,
      content,
      attachPath,
      attachName,
    },
  });

  // 비접속 회원에게 이메일 알림 — 1:1 회원 수신에 한해.
  // 비회원(toGuest) 은 이메일 없음, broadcast 는 too noisy 라 skip.
  if (toUserId) {
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: toUserId },
        select: { id: true, name: true, email: true, emailVerified: true },
      });
      if (recipient?.email && recipient.emailVerified) {
        // 활성 세션 (heartbeat) 안에 receiver 가 있는지 확인
        const active = listActive().some((r) => r.userId === toUserId);
        if (!active) {
          // 비동기 발송 — 응답 지연 안 되도록 await 없이
          sendChatNotificationEmail(
            recipient.email,
            recipient.name,
            sender.name,
            content,
            !!attachPath,
          ).catch((e) => console.error("[chat email]", e));
        }
      }
    } catch (e) {
      console.error("[chat notification check]", e);
    }
  }

  return NextResponse.json({ id: created.id, createdAt: created.createdAt });
}

/**
 * GET /api/chat?with=u:N|g:SESSIONID  → 대화 이력 200건
 * GET /api/chat                       → 안 읽은 수신 목록 (broadcast 포함)
 */
export async function GET(req: NextRequest) {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  const guestId = req.nextUrl.searchParams.get("guestId");

  let meUserId: number | null = null;
  let meGuest: string | null = null;
  if (token) {
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    if (s && s.expires > new Date()) meUserId = s.userId;
  }
  if (!meUserId && guestId) meGuest = guestId.slice(0, 64);
  if (!meUserId && !meGuest) {
    return NextResponse.json({ message: "신원 확인 불가" }, { status: 400 });
  }

  const withParam = req.nextUrl.searchParams.get("with");

  if (withParam) {
    const m = withParam.match(/^([ugb]):(.*)$/);
    if (!m) return NextResponse.json({ message: "with 형식 오류" }, { status: 400 });
    const kind = m[1];
    const peerId = m[2];

    // broadcast 대화 이력 — toBroadcast=true 모두 (발신자 무관, 시간순)
    if (kind === "b") {
      const messages = await prisma.chatMessage.findMany({
        where: { toBroadcast: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      return NextResponse.json({ messages });
    }

    const peerIsUser = kind === "u";
    const peerUserId = peerIsUser ? parseInt(peerId, 10) : null;
    const peerGuest = peerIsUser ? null : peerId;

    const messages = await prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            fromUserId: meUserId,
            fromGuest: meGuest,
            toUserId: peerUserId,
            toGuest: peerGuest,
          },
          {
            fromUserId: peerUserId,
            fromGuest: peerGuest,
            toUserId: meUserId,
            toGuest: meGuest,
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      // (deletedAt 필터는 where 절에서 처리)
    });

    return NextResponse.json({ messages });
  }

  // 안 읽은 1:1 수신 메시지 + 최근 broadcast (별도 필드)
  const [unread, broadcasts] = await Promise.all([
    prisma.chatMessage.findMany({
      where: {
        readAt: null,
        toBroadcast: false,
        deletedAt: null,
        ...(meUserId ? { toUserId: meUserId } : { toGuest: meGuest }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.chatMessage.findMany({
      where: { toBroadcast: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({ unread, broadcasts });
}
