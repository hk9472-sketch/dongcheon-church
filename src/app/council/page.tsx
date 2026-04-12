"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CouncilPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/council/report-entry");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      로딩 중...
    </div>
  );
}
