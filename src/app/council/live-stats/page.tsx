"use client";

// 권찰회용 실시간 통계 — admin/live-stats 의 클라이언트 컴포넌트를 재사용.
// 권한은 council/layout 의 councilAccess 체크로 보호. 통계 API 들도
// GET 에 한해 councilAccess 까지 허용하도록 별도 완화됨.
export { default } from "@/app/admin/live-stats/page";
