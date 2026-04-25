import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import * as tls from "tls";

// GET /api/admin/certificate?host=pkistdc.net&port=443
//
// 지정한 host:port 에 TLS 연결해 서버 인증서 정보를 반환.
// 관리자만 조회 가능.

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

interface PeerCert {
  subject?: { CN?: string; O?: string };
  issuer?: { CN?: string; O?: string };
  subjectaltname?: string;
  valid_from?: string;
  valid_to?: string;
  fingerprint256?: string;
  serialNumber?: string;
}

function connectForCert(host: string, port: number, timeoutMs = 5000): Promise<PeerCert> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false, // self-signed 도 정보는 조회
        timeout: timeoutMs,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate(true) as PeerCert;
          resolve(cert);
        } catch (e) {
          reject(e);
        } finally {
          socket.end();
        }
      }
    );
    socket.on("error", (err) => reject(err));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("연결 시간 초과 (5초)"));
    });
  });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const url = new URL(request.url);
  const host = (url.searchParams.get("host") || "").trim();
  const port = parseInt(url.searchParams.get("port") || "443", 10);

  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    return NextResponse.json({ error: "잘못된 host" }, { status: 400 });
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return NextResponse.json({ error: "잘못된 port" }, { status: 400 });
  }

  try {
    const cert = await connectForCert(host, port);
    if (!cert || !cert.subject || !cert.valid_to) {
      return NextResponse.json({
        host, port,
        configured: false,
        error: "인증서 정보를 가져올 수 없음",
      });
    }

    const now = new Date();
    const validTo = new Date(cert.valid_to);
    const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
    const daysLeft = Math.floor((validTo.getTime() - now.getTime()) / 86400000);
    const status: "ok" | "expiring" | "expired" =
      daysLeft < 0 ? "expired" : daysLeft < 30 ? "expiring" : "ok";

    // subjectAltName 파싱: "DNS:pkistdc.net, DNS:www.pkistdc.net"
    const altNames = (cert.subjectaltname || "")
      .split(",")
      .map((s) => s.trim().replace(/^DNS:/, ""))
      .filter(Boolean);

    return NextResponse.json({
      host,
      port,
      configured: true,
      subjectCN: cert.subject?.CN || null,
      issuerCN: cert.issuer?.CN || null,
      issuerO: cert.issuer?.O || null,
      altNames,
      validFrom: validFrom ? validFrom.toISOString() : null,
      validTo: validTo.toISOString(),
      daysLeft,
      status,
      fingerprint: cert.fingerprint256 || null,
      serialNumber: cert.serialNumber || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      host, port,
      configured: false,
      error: msg,
    });
  }
}
