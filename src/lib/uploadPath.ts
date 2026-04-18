import path from "path";

// 파일 업로드 기본 루트.
// Turbopack 정적 분석이 `path.join(cwd, "data", <dynamic>)` 같은 호출을
// 추적해 data/ 하위 파일 전체(15,000+)에 대한 file pattern 경고를 내는 것을
// 피하기 위해, path.join 대신 Array.join(path.sep) 을 사용한다.
// 런타임 동작은 동일.

const DATA_SEG = "data"; // 기본 업로드 루트 세그먼트

function rootSegment(): string {
  return process.env.UPLOAD_DIR || DATA_SEG;
}

/** 게시판 slug 대응 업로드 디렉터리 절대 경로 */
export function getUploadDir(subPath: string): string {
  return [process.cwd(), rootSegment(), subPath].join(path.sep);
}

/** DB 저장용 상대 경로 (예: "data/DcNotice/xxx.png") */
export function getRelUploadPath(subPath: string, fileName: string): string {
  return `${rootSegment()}/${subPath}/${fileName}`;
}

/** 업로드 루트 자체 (백업/첨부 목록용) */
export function getUploadRoot(): string {
  return [process.cwd(), rootSegment()].join(path.sep);
}
