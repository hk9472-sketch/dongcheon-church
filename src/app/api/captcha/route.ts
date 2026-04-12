import { NextResponse } from "next/server";
import { generateCaptcha } from "@/lib/captcha";

// GET /api/captcha
// CAPTCHA 질문과 검증 토큰 발급
export async function GET() {
  const { question, token } = generateCaptcha();
  return NextResponse.json({ question, token });
}
