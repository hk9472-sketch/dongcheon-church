import path from "path";

// 파일 업로드 기본 루트.
// Turbopack 정적 분석이 `path.join(cwd, "data", <dynamic>)` 같은 호출을
// 추적해 data/ 하위 파일 전체(15,000+)에 대한 file pattern 경고를 내는 것을
// 피하기 위해, path.join 대신 Array.join(path.sep) 을 사용한다.
// (Turbopack 은 path.join 만 특별 추적)

const DATA_SEG = "data"; // 기본 업로드 루트 세그먼트

/**
 * URL / DB 노출용 상대 경로 세그먼트.
 * UPLOAD_DIR 값의 선행 "./" 는 제거해 일관된 "data" 형태로 유지.
 * (예: UPLOAD_DIR="./data" → "data")
 */
function urlSegment(): string {
  const raw = (process.env.UPLOAD_DIR || DATA_SEG).trim();
  return raw.replace(/^(\.\/)+/, "") || DATA_SEG;
}

/** 실제 디스크 절대 경로 (path.resolve 로 정규화) */
function absRoot(): string {
  // path.resolve(cwd, segment) — ./ 나 중복 슬래시 정리, 절대 경로 반환
  return path.resolve(process.cwd(), urlSegment());
}

/** 업로드 디렉터리 절대 경로 (예: "/app/data/DcNotice/inline/20260418") */
export function getUploadDir(subPath: string): string {
  return path.resolve(absRoot(), subPath);
}

/** DB/URL 용 상대 경로 (예: "data/DcNotice/xxx.png") */
export function getRelUploadPath(subPath: string, fileName: string): string {
  return `${urlSegment()}/${subPath}/${fileName}`;
}

/** 업로드 루트 절대 경로 (경로 검증용) */
export function getUploadRoot(): string {
  return absRoot();
}
