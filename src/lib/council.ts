import { cookies } from "next/headers";
import prisma from "./db";

export interface CouncilUser {
  id: number;
  userId: string;
  name: string;
  isAdmin: number;
  councilAccess: boolean;
}

/**
 * 권찰회 접근 권한 확인
 * - councilAccess = true 이거나
 * - isAdmin <= 2 (관리자)이면 접근 가능
 */
export async function getCouncilUser(): Promise<CouncilUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
    });
    if (!session || session.expires < new Date()) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        userId: true,
        name: true,
        isAdmin: true,
        councilAccess: true,
      },
    });

    if (!user) return null;
    if (!user.councilAccess && user.isAdmin > 2) return null;

    return user;
  } catch {
    return null;
  }
}
