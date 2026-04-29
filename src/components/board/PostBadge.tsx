// 새 글 (N) / 수정 글 (U) 뱃지.
// 작성/수정이 5일 이내일 때만 표시.

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

interface Props {
  createdAt: string | Date;
  updatedAt: string | Date;
}

export default function PostBadge({ createdAt, updatedAt }: Props) {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  const isUpdated = updated - created > 60_000; // 작성 후 1분 이상 차이나면 수정된 글
  const isNew = now - created < FIVE_DAYS_MS;
  const isRecentUpdate = isUpdated && now - updated < FIVE_DAYS_MS;

  if (isRecentUpdate) {
    return (
      <span className="inline-block ml-1.5 px-1 py-px text-[9px] font-bold leading-none text-white bg-orange-500 rounded shadow-sm align-middle">
        U
      </span>
    );
  }
  if (isNew) {
    return (
      <span className="inline-block ml-1.5 px-1 py-px text-[9px] font-bold leading-none text-white bg-red-500 rounded shadow-sm align-middle">
        N
      </span>
    );
  }
  return null;
}
