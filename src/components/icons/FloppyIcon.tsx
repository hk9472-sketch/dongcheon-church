// 첨부파일 표시용 3.5인치 플로피 디스크 아이콘.
// 이모지 📎 대비 장점:
//   - 모바일/데스크톱 렌더 차이 없음 (이모지는 OS 폰트 의존)
//   - 색상 제어 가능 (currentColor)
//   - 크기 일관성 (모바일에서 거대하게 표시되는 문제 해결)

interface Props {
  className?: string;
  title?: string;
}

export default function FloppyIcon({ className = "w-4 h-4 text-blue-600", title = "첨부파일" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block align-text-bottom ${className}`}
      aria-label={title}
      role="img"
    >
      <title>{title}</title>
      {/* 외곽 디스켓 본체 — 우상단 사선 모서리 (셔터 슬라이더 단서) */}
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      {/* 라벨 영역 (하단) */}
      <polyline points="17 21 17 13 7 13 7 21" />
      {/* 메탈 셔터 (상단) */}
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}
