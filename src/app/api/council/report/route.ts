import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/report?deptId=1&from=2026-01-01&to=2026-03-01&groupId=0
// groupId=0 → 전체
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const deptId = Number(request.nextUrl.searchParams.get("deptId"));
  const fromStr = request.nextUrl.searchParams.get("from");
  const toStr = request.nextUrl.searchParams.get("to");
  const groupId = Number(request.nextUrl.searchParams.get("groupId") || "0");

  if (!deptId || !fromStr || !toStr) {
    return NextResponse.json({ error: "deptId, from, to 필요" }, { status: 400 });
  }

  const from = new Date(fromStr + "T00:00:00Z");
  const to = new Date(toStr + "T23:59:59Z");

  // 해당 부서의 구역 ID 목록
  const groups = await prisma.councilGroup.findMany({
    where: groupId ? { id: groupId, deptId } : { deptId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, teacher: true },
  });

  const groupIds = groups.map((g) => g.id);

  // 출석 데이터 조회
  const attendances = await prisma.councilAttendance.findMany({
    where: {
      groupId: { in: groupIds },
      date: { gte: from, lte: to },
    },
    orderBy: [{ date: "asc" }, { groupId: "asc" }],
  });

  // 구역+날짜별 집계
  const report: Record<string, {
    date: string;
    groupId: number;
    groupName: string;
    teacher: string | null;
    attSum: number[];
    rtSum: number[];
    memberCount: number;
  }> = {};

  for (const att of attendances) {
    const dateStr = att.date.toISOString().slice(0, 10);
    const key = `${att.groupId}_${dateStr}`;
    const group = groups.find((g) => g.id === att.groupId);

    if (!report[key]) {
      report[key] = {
        date: dateStr,
        groupId: att.groupId,
        groupName: group?.name || "",
        teacher: group?.teacher || null,
        attSum: [0, 0, 0, 0, 0],
        rtSum: [0, 0, 0, 0, 0],
        memberCount: 0,
      };
    }

    const r = report[key];
    if (att.memberName) {
      // 개인 행 → 합산
      r.attSum[0] += att.att1;
      r.attSum[1] += att.att2;
      r.attSum[2] += att.att3;
      r.attSum[3] += att.att4;
      r.attSum[4] += att.att5;
      r.rtSum[0] += att.rt1;
      r.rtSum[1] += att.rt2;
      r.rtSum[2] += att.rt3;
      r.rtSum[3] += att.rt4;
      r.rtSum[4] += att.rt5;
      r.memberCount++;
    } else {
      // 집계 행 → 직접 사용
      r.attSum[0] += att.att1;
      r.attSum[1] += att.att2;
      r.attSum[2] += att.att3;
      r.attSum[3] += att.att4;
      r.attSum[4] += att.att5;
      r.rtSum[0] += att.rt1;
      r.rtSum[1] += att.rt2;
      r.rtSum[2] += att.rt3;
      r.rtSum[3] += att.rt4;
      r.rtSum[4] += att.rt5;
    }
  }

  return NextResponse.json({
    groups,
    data: Object.values(report).sort((a, b) =>
      a.date.localeCompare(b.date) || a.groupId - b.groupId
    ),
  });
}
