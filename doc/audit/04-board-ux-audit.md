# Board & UX Audit — 동천교회 홈페이지

**감사일**: 2026-04-13
**감사팀**: UX/Functional Auditor (Agent)
**범위**: 게시판, 인증, 권찰회, 성경/찬송, 실시간 예배, 홈페이지, 헤더/푸터

---

## CRITICAL

### C1. 게시판 쓰기/답글/공지/댓글 권한이 서버에서 미검사
- **파일**: `src/app/api/board/write/route.ts`
- **문제**: `grantWrite`, `grantReply`, `grantNotice`, `grantComment`가 DB에 저장되고 관리자 UI에서 설정되지만 실제 write API에서 **한 번도 참조되지 않음**.
- **영향**: 관리자 전용으로 설정된 게시판에도 CAPTCHA만 통과하면 누구나 글·답글·공지 작성 가능.
- **수정**: write route 초입에서 `board.grantWrite`, 답글은 `grantReply`, `isNotice=true`면 `grantNotice`로 레벨 비교. `userLevel > board.grantXxx`면 403.
- **동일 이슈**: `src/app/api/board/comment/route.ts`도 `grantComment` 미검사 가능성 높음.

### C2. 파일 업로드 검증 전무 (RCE/디스크 공격)
- **파일**: `src/app/api/board/write/route.ts:95-111`
- **문제**: 클라이언트 임의 확장자/크기/MIME 파일 저장. `.php`, `.html`, `.svg`, 2GB 파일도 허용.
- **수정**: 확장자 allow-list + 크기 제한 + 매직바이트 체크 + 위험 확장자 reject.

### C3. 작성자 이름을 로그인 회원도 자유 입력
- **파일**: `src/app/board/[boardId]/write/page.tsx:264-271`
- **문제**: 로그인 상태에서도 이름 input이 빈 값. 세션 이름과 무관하게 저장됨 → 장로·목사 사칭 가능.
- **수정**: 세션 있으면 이름/비밀번호 input 숨김, 서버에서 `authorName = sessionUser.name` 강제.

### C4. 수정 모드 비밀번호 필드가 항상 required
- **파일**: `src/app/api/board/write/route.ts:79,152-176`
- **문제**: 로그인 회원의 수정 폼에서 비밀번호 입력을 요구하나 서버에서 재검증 없음. 비회원 이관 글에만 비번 검증.
- **수정**: 로그인 시 비밀번호 필드 숨김, 서버는 세션 작성자 체크만.

---

## HIGH

### H1. `generateMetadata`가 boardId 필터링 없이 post 조회
- `src/app/board/[boardId]/[postId]/page.tsx:463-470` — 다른 게시판 글 제목이 탭 제목에 누출.
- **수정**: `findFirst({where: {id, boardId}})`.

### H2. 비밀글 작성자가 비회원일 때 재열람 불가
- `src/app/board/[boardId]/[postId]/page.tsx:59-63`
- 비회원이 쓴 비밀글은 본인도 다시 못 보는 구조.
- **수정**: 비밀번호로 unlock 플로우 추가 또는 비회원 비밀글 옵션 숨김.

### H3. 조회수가 새로고침마다 +1
- `src/app/board/[boardId]/[postId]/page.tsx:66-71`
- **수정**: 쿠키 `dc_view_{postId}` 또는 IP+postId 테이블로 1일 1회 제한.

### H4. 답글이 공지 글 아래에 붙을 수 있음
- 공지에 답글 → 일반 목록에 분리되어 표시, 시각적 혼선.
- **수정**: 공지에 답글 버튼 비활성 또는 경고.

### H5. 공지 정렬 변수 `fiveDaysAgo` 관련 미세 이슈 (낮음)

### H6. 추천 방지가 IP 기반 → 교회 Wi-Fi 1표 제한
- `src/app/api/board/vote/route.ts:45-50`
- **수정**: 쿠키 토큰 조합 또는 비로그인 추천 불허.

### H7. 검색바 체크박스 모두 해제 시 결과 0
- `src/components/board/SearchBar.tsx:31-38`
- **수정**: 제출 시 최소 한 개 켜져 있는지 검사.

### H8. 레거시 URL 리다이렉트에서 추가 파라미터 무시
- `src/middleware.ts:42-52` — `write.php` / `view.php`의 category, page, keyword 등 손실.
- **수정**: 전체 searchParams 포워딩.

### H9. `/live`가 `channel=` 형식 URL만 파싱
- `src/app/live/page.tsx:10-14` — `@handle`, `/user/`, `/c/`, `youtu.be/` 형식 전부 실패.
- **수정**: 다양한 URL 패턴 지원 또는 관리자 안내 명확화.

### H10. 실시간 참여 등록 — 비로그인 + CAPTCHA 없음 + rate limit 없음
- `src/app/live/LiveAttendanceForm.tsx:26-55`
- 1회 제출 최대 20행 → 스팸 도배 가능.
- **수정**: IP rate limit + CAPTCHA 또는 로그인 필수.

---

## MEDIUM

- **M1**: 홈페이지 공지 HTML을 `dangerouslySetInnerHTML`로 직접 렌더 → DOMPurify 필요.
- **M2**: 댓글 삭제 버튼이 권한 무관하게 항상 노출, 로그인 사용자에게도 비번 prompt.
- **M3**: `commentPolicy==="ALLOW"`에서 작성자 본인도 수정 불가 → 최소 본인 수정은 허용 권장.
- **M4**: 정렬 컬럼 현재 값 시각적 표시 없음 (▲/▼).
- **M5**: `hit+1` 표시 vs DB 실제 값 불일치(동시 접속).
- **M6**: 회원가입 비밀번호 `minLength={4}` → 8 이상 권장.
- **M7**: 프로필 페이지 session 재검증 중복 → redirect 루프 잠재.
- **M8**: 게시판 미존재 시 `notFound()` 대신 인라인 메시지 → SEO 혼동.
- **M9**: sitemap에 비공개 게시판/비밀글 포함.
- **M10**: 모바일 메뉴 링크 세로 정렬 깨짐 (iPhone SE).
- **M11**: Motto/표어 HTML도 sanitize 필요.
- **M12**: `/bible`, `/hymn` 로그인 필수 여부 확인 필요.

## LOW

- `confirm`/`alert`/`prompt` 네이티브 다이얼로그 남용.
- 이미지 `<img>` alt가 원본 파일명 그대로.
- 번호 컬럼이 답글/공지 포함 시 번호 점프.
- 한국어 ID에 `autoComplete="username"` 이상 동작.
- VisitorTracker 개발 모드에서도 카운트 여부 불명.
- `/live` 자동재생 정책 상충.
- HelpButton 슬러그 오타 시 무음 실패.
- 회원가입 이메일 오타 수정 경로 없음.
- 메인 `calc(100dvh - 140px)` 하드코드.
- Header가 3회 fetch 순차 호출 → SSR로 통합 가능.

---

## 출시 전 체크리스트

1. **C1, C2, C3, C4** 반드시 수정 (권한·파일·이름·비번).
2. **H2, H3** 사용자 체감 이슈.
3. **H9, H10** 실시간 예배 핵심 기능.
4. **M1, M11** DOMPurify 1줄 추가.
5. **모바일 실기기 테스트**: 주일 예배 시나리오 (로그인 → 참여등록 → 영상 → 게시판 댓글).
6. **레거시 URL 커버리지**: 카카오톡·다음카페 공유 링크 유입 로그 확인 후 H8.

감사 범위 밖: `/accounting`, `/admin/*` 내부 로직, 권찰회 집계 정확성은 별도 QA 필요.
