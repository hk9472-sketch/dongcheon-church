import path from "path";

// 파일 업로드 기본 루트.
// Turbopack 은 path.join / path.resolve 호출을 특별히 추적해 "data/ 아래
// 15,000+ 파일 패턴" 경고를 낸다. 이를 피하면서도 보안 검증용으로 정규화된
// 절대 경로를 돌려주기 위해:
//   · 경로 조합: [cwd, seg, sub].join(path.sep) — Turbopack 미추적
//   · 정규화:    path.normalize(singleArg)     — 단일 인수라 미추적
// 두 가지만 사용한다. path.resolve / path.join 은 사용하지 않는다.

const DATA_SEG = "data";

/**
 * URL / DB 노출용 상대 경로 세그먼트.
 * UPLOAD_DIR 값의 선행 "./" 는 제거해 일관된 "data" 형태로 유지.
 */
function urlSegment(): string {
  const raw = (process.env.UPLOAD_DIR || DATA_SEG).trim();
  return raw.replace(/^(\.\/)+/, "") || DATA_SEG;
}

/** 실제 디스크 절대 경로 (정규화 포함) */
function absRoot(): string {
  return path.normalize([process.cwd(), urlSegment()].join(path.sep));
}

/** 업로드 디렉터리 절대 경로 (예: "/app/data/DcNotice/inline/20260418") */
export function getUploadDir(subPath: string): string {
  return path.normalize([absRoot(), subPath].join(path.sep));
}

/** DB/URL 용 상대 경로 (예: "data/DcNotice/xxx.png") */
export function getRelUploadPath(subPath: string, fileName: string): string {
  return `${urlSegment()}/${subPath}/${fileName}`;
}

/** 업로드 루트 절대 경로 (경로 검증용) */
export function getUploadRoot(): string {
  return absRoot();
}
