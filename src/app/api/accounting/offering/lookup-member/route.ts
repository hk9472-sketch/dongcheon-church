import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess, hasMemberEdit } from "@/lib/accountAuth";
import { resolveMemberIdByNo, migrateInitialNumbers } from "@/lib/offeringMemberNumber";

// GET /api/accounting/offering/lookup-member?memberNo=X&date=YYYY-MM-DD
//   특정 일자의 표면 memberNo → 내부 OfferingMember 정보 조회.
//   history 가 있으면 그 매핑 사용, 없으면 OfferingMember.id 직접 매칭(레거시 호환).
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const sp = req.nextUrl.searchParams;
  const memberNoStr = sp.get("memberNo");
  const dateStr = sp.get("date");
  if (!memberNoStr || !dateStr) {
    return NextResponse.json({ error: "memberNo, date 필수" }, { status: 400 });
  }
  const memberNo = parseInt(memberNoStr, 10);
  if (!Number.isInteger(memberNo) || memberNo <= 0) {
    return NextResponse.json({ error: "잘못된 memberNo" }, { status: 400 });
  }

  // 처음 사용 시 history 미초기화면 자동 migrate
  await migrateInitialNumbers();

  const internalId = await resolveMemberIdByNo(memberNo, dateStr);
  if (!internalId) {
    return NextResponse.json({ error: "해당 일자에 유효한 번호 아님" }, { status: 404 });
  }

  const member = await prisma.offeringMember.findUnique({
    where: { id: internalId },
    select: { id: true, name: true, groupName: true },
  });
  if (!member) {
    return NextResponse.json({ error: "회원 데이터 없음" }, { status: 404 });
  }

  const canSeeName = hasMemberEdit(acc.user);
  return NextResponse.json({
    id: member.id,
    memberNo,
    name: canSeeName ? member.name : "*",
    groupName: canSeeName ? member.groupName : null,
  });
}
