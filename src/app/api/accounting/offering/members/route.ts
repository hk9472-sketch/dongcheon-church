import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * 회계 접근 권한 확인
 */
async function checkAccess(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, accountAccess: true },
  });
  if (!user) return false;
  return user.isAdmin <= 2 || user.accountAccess;
}

/**
 * GET /api/accounting/offering/members
 * 연보 교인 목록 조회
 * Query: search (이름 검색), groupName (구역), activeOnly (활성만)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") || searchParams.get("name");
  const groupName = searchParams.get("groupName");
  const activeOnly = searchParams.get("activeOnly");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (search) {
    where.name = { contains: search };
  }
  if (groupName) {
    where.groupName = groupName;
  }
  if (activeOnly === "true") {
    where.isActive = true;
  }

  const members = await prisma.offeringMember.findMany({
    where,
    include: {
      // 가족 대표 정보
      family: {
        select: { id: true, name: true },
      },
      // 나를 대표로 지정한 교인들
      members: {
        select: { id: true, name: true, groupName: true, isActive: true },
      },
    },
    orderBy: { id: "asc" },
  });

  // familyId가 있는 교인은 같은 familyId를 공유하는 형제 구성원도 표시
  // familyId별로 구성원 목록 수집
  const familyGroups: Record<number, { id: number; name: string }[]> = {};
  for (const m of members) {
    if (m.familyId) {
      if (!familyGroups[m.familyId]) familyGroups[m.familyId] = [];
      familyGroups[m.familyId].push({ id: m.id, name: m.name });
    }
  }
  // DB에서 familyId가 있지만 검색 결과에 없는 구성원도 가져오기
  const allFamilyIds = [...new Set(members.map((m) => m.familyId).filter(Boolean))] as number[];
  if (allFamilyIds.length > 0) {
    const siblings = await prisma.offeringMember.findMany({
      where: { familyId: { in: allFamilyIds } },
      select: { id: true, name: true, familyId: true },
    });
    for (const s of siblings) {
      if (!s.familyId) continue;
      if (!familyGroups[s.familyId]) familyGroups[s.familyId] = [];
      if (!familyGroups[s.familyId].some((x) => x.id === s.id)) {
        familyGroups[s.familyId].push({ id: s.id, name: s.name });
      }
    }
  }

  // 응답에 familyMembers 추가
  const result = members.map((m) => {
    // 대표인 경우: members (나를 대표로 지정한 사람들)
    // 구성원인 경우: 같은 familyId를 공유하는 형제 (자신 제외) + 대표
    let familyMembers: { id: number; name: string }[] = [];
    if (m.members.length > 0) {
      // 나를 대표로 지정한 사람들
      familyMembers = m.members.map((fm) => ({ id: fm.id, name: fm.name }));
    } else if (m.familyId && familyGroups[m.familyId]) {
      // 같은 familyId를 공유하는 형제 (자신 제외)
      familyMembers = familyGroups[m.familyId].filter((x) => x.id !== m.id);
      // 대표도 추가
      if (m.family && !familyMembers.some((x) => x.id === m.family!.id)) {
        familyMembers.unshift({ id: m.family.id, name: m.family.name });
      }
    }
    return { ...m, members: familyMembers };
  });

  return NextResponse.json(result);
}

/**
 * POST /api/accounting/offering/members
 * 연보 교인 등록
 * Body: { name, groupName?, familyId? }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json();
  const { id, name, groupName, familyId } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "이름은 필수입니다" }, { status: 400 });
  }

  // 번호 직접 지정 시 중복 검사
  if (id != null) {
    const numId = parseInt(String(id), 10);
    if (isNaN(numId) || numId <= 0) {
      return NextResponse.json({ error: "번호는 양의 정수여야 합니다" }, { status: 400 });
    }
    const existing = await prisma.offeringMember.findUnique({ where: { id: numId } });
    if (existing) {
      return NextResponse.json({ error: `번호 ${numId}은(는) 이미 사용 중입니다` }, { status: 409 });
    }
  }

  // familyId가 있으면 해당 교인이 존재하는지 확인
  if (familyId != null) {
    const family = await prisma.offeringMember.findUnique({
      where: { id: familyId },
    });
    if (!family) {
      return NextResponse.json(
        { error: "가족 대표 교인을 찾을 수 없습니다" },
        { status: 400 }
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createData: any = {
    name: name.trim(),
    groupName: groupName?.trim() || null,
    familyId: familyId ?? null,
  };
  if (id != null) {
    createData.id = parseInt(String(id), 10);
  }

  const member = await prisma.offeringMember.create({
    data: createData,
  });

  return NextResponse.json(member, { status: 201 });
}
