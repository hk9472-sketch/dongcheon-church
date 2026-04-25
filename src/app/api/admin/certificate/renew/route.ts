import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const execAsync = promisify(exec);

// POST /api/admin/certificate/renew
//
// `sudo /usr/local/bin/dc-cert-renew` 를 실행해 certbot 갱신 시도.
// 권한:
//   - 관리자(isAdmin <= 2) 만 호출 가능
//   - 서버 측에서 hk9472 가 sudoers 로 해당 스크립트만 비번 없이 실행 가능해야 함
// 레이트 리밋: 5분에 3회 (도배 방지)

async function requireAdmin() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  // 레이트 리밋
  const ip = getClientIp(request);
  const rl = checkRateLimit(`cert-renew:${ip}`, 3, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
    );
  }

  try {
    const { stdout, stderr } = await execAsync("sudo -n /usr/local/bin/dc-cert-renew", {
      timeout: 180_000, // 3분 타임아웃
      maxBuffer: 1024 * 1024,
    });
    return NextResponse.json({
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
    // exit code 1 + "no certificates due" 는 정상 — 갱신 대상 없음
    const stdout = (err.stdout || "").trim();
    const stderr = (err.stderr || "").trim();
    const noRenewalNeeded =
      /no.*certificates? due for renewal|no renewals were attempted/i.test(stdout + stderr);
    if (noRenewalNeeded) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "현재 갱신이 필요한 인증서가 없습니다. (만료 30일 이상 남음)",
        stdout,
        stderr,
      });
    }
    return NextResponse.json(
      {
        success: false,
        stdout,
        stderr: stderr || err.message || "",
        code: err.code,
      },
      { status: 500 }
    );
  }
}
