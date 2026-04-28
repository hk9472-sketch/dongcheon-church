import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { listBackups, restoreBackup } from "@/lib/operationBackup";

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// GET /api/admin/operation-backups — 백업 목록 (최근 50건)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const backups = await listBackups(50);
  return NextResponse.json({ backups });
}

// POST /api/admin/operation-backups — { backupId } 로 복원
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const backupId = Number(body?.backupId);
  if (!Number.isFinite(backupId) || backupId <= 0) {
    return NextResponse.json({ message: "backupId 필요" }, { status: 400 });
  }
  try {
    const result = await restoreBackup(backupId);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "복원 실패" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/operation-backups?id=N — 백업 삭제
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ message: "id 필요" }, { status: 400 });
  }
  await prisma.operationBackup.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
