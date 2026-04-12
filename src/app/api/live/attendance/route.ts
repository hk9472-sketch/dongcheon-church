import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// 한국시간 현재 시각
function nowKST(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

// POST /api/live/attendance - 실시간 예배 참여 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const names: string[] = body.names;

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ message: "이름을 입력해 주세요." }, { status: 400 });
    }

    const cleaned = names
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter((n) => n.length > 0 && n.length <= 100)
      .slice(0, 20);

    if (cleaned.length === 0) {
      return NextResponse.json({ message: "유효한 이름이 없습니다." }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    const kstNow = nowKST();

    await prisma.liveAttendance.createMany({
      data: cleaned.map((name) => ({ name, ip, createdAt: kstNow })),
    });

    return NextResponse.json({ message: `${cleaned.length}명 등록되었습니다.`, count: cleaned.length });
  } catch (err) {
    console.error("실시간 참여 등록 오류:", err);
    return NextResponse.json({ message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
