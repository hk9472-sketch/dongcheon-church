/**
 * 관리/권찰회/행정실(회계·연보) 도움말 일괄 upsert.
 *
 * 사용법:
 *   npx tsx scripts/seed-help-all.ts
 *
 * 개발 DB 에 33개 도움말을 생성/업데이트한다. 이후 mysqldump 로 운영 이관.
 */
import prisma from "../src/lib/db";

type HelpSeed = { slug: string; title: string; sortOrder: number; content: string };

const PAGES: HelpSeed[] = [
  // ══════════════════ 관리메뉴 ══════════════════
  {
    slug: "admin-dashboard",
    title: "관리자 대시보드",
    sortOrder: 100,
    content: `<h2>관리자 대시보드</h2>
<p>사이트 전체 현황을 한눈에 보고 관리 메뉴로 진입하는 허브 페이지입니다.</p>

<h3>화면 구성</h3>
<ul>
  <li><strong>통계 카드 4개</strong> — 게시판·회원·게시글·댓글 개수를 실시간으로 표시.</li>
  <li><strong>게시판 목록</strong> — 각 게시판의 최근 통계와 <em>설정</em> 바로가기.</li>
  <li><strong>새 게시판</strong> — 게시판 생성 페이지로 이동.</li>
</ul>

<h3>카운터 재계산</h3>
<p>게시글/댓글 수가 실제와 달라 보일 때 <strong>카운터 재계산</strong> 버튼을 누르면 각 게시판의 집계를 다시 계산합니다. 데이터가 많으면 몇 초 걸릴 수 있습니다.</p>

<h3>흔한 흐름</h3>
<ol>
  <li>로그인 → 대시보드에서 현황 파악</li>
  <li>점검이 필요한 게시판은 "설정" 링크로 진입</li>
  <li>새 게시판이 필요하면 "새 게시판" 버튼</li>
</ol>`,
  },
  {
    slug: "admin-boards",
    title: "게시판 관리",
    sortOrder: 101,
    content: `<h2>게시판 관리</h2>
<p>사이트에 등록된 모든 게시판의 목록과 상세 설정을 관리합니다.</p>

<h3>목록 정보</h3>
<ul>
  <li><strong>게시판 ID</strong> — URL 에 쓰이는 고정 식별자 (변경 불가).</li>
  <li><strong>제목 / 유형 / 스킨 / 그룹 / 글 수 / 생성일</strong>.</li>
</ul>

<h3>주요 버튼</h3>
<ul>
  <li><strong>게시판 생성</strong> — 새 게시판 추가 화면으로 이동.</li>
  <li><strong>게스트 쓰기 권한 부여</strong> — 비로그인 사용자가 글·댓글을 쓸 수 있도록 <em>일괄 허용</em>. (개별 게시판의 <code>grantWrite=99</code> 설정)</li>
  <li><strong>설정</strong> — 해당 게시판의 상세 설정 페이지 진입.</li>
  <li><strong>보기</strong> — 실제 게시판 프론트 화면으로 이동.</li>
</ul>

<h3>주의</h3>
<p>게시판 삭제 기능은 제공되지 않습니다. 사용하지 않을 게시판은 "숨김" 또는 설정에서 메뉴 노출 해제로 관리하세요.</p>`,
  },
  {
    slug: "admin-boards-create",
    title: "게시판 생성",
    sortOrder: 102,
    content: `<h2>게시판 생성</h2>
<p>새 게시판을 만들고 초기 설정(유형·스킨·기능·권한·카테고리)을 한 화면에서 구성합니다.</p>

<h3>필수 입력</h3>
<ul>
  <li><strong>게시판 ID (slug)</strong> — URL 에 사용. <em>영문·숫자·밑줄만 가능하고 생성 후 변경 불가</em>.</li>
  <li><strong>게시판 이름</strong> — 사용자에게 보이는 제목.</li>
  <li><strong>게시판 유형</strong> — BBS / 갤러리 / 자료실 / 음악 / 투표 중 선택.</li>
</ul>

<h3>주요 설정 그룹</h3>
<ul>
  <li><strong>표시 옵션</strong> — 페이지당 글 수, 업로드 크기, 정렬순서, 메뉴/메인 표시, 로그인 필수.</li>
  <li><strong>스킨 선택</strong> — 유형에 맞는 스킨만 노출. 색상 프리뷰로 확인.</li>
  <li><strong>기능</strong> — 카테고리·댓글·비밀글·답글·HTML·파일·자동링크·IP 표시.</li>
  <li><strong>댓글 정책</strong> — 수정가능 / 추가만 / 댓글없음.</li>
  <li><strong>카테고리</strong> — 입력 후 Enter 또는 추가 버튼. 위/아래로 순서 변경 가능.</li>
  <li><strong>권한 레벨</strong> — 목록/읽기/쓰기/댓글/답글/삭제/공지/비밀글 보기별로 필요한 회원 레벨 설정. (1=관리자, 10=일반, 99=비회원)</li>
</ul>

<h3>주의</h3>
<p>게시판 ID 는 생성 후 변경 불가합니다. 스킨은 유형에 맞는 것만 선택 가능합니다.</p>`,
  },
  {
    slug: "admin-skins",
    title: "스킨 관리",
    sortOrder: 103,
    content: `<h2>스킨 관리</h2>
<p>게시판에 적용 가능한 스킨 라이브러리를 조회합니다. 이 페이지는 <em>조회 전용</em>입니다 — 스킨 자체를 편집하거나 추가하는 기능은 아닙니다.</p>

<h3>사용법</h3>
<ul>
  <li>상단 <strong>유형 필터</strong>(전체·BBS·갤러리·음악·자료실·투표·웹진·멀티) 로 목록을 좁힙니다.</li>
  <li>스킨 카드를 클릭하면 우측 패널에 상세(스킨 ID·설명·제작자·지원 게시판·색상 팔레트)가 표시됩니다.</li>
</ul>

<h3>언제 쓰나요</h3>
<p>게시판 생성/수정 시 어떤 스킨을 고를지 미리 확인할 때 참고합니다. 여기서 확인한 <strong>스킨 이름</strong>을 그 화면에서 선택하면 됩니다.</p>`,
  },
  {
    slug: "admin-settings",
    title: "사이트 설정",
    sortOrder: 104,
    content: `<h2>사이트 설정</h2>
<p>사이트 전체 색상 테마·메뉴바 글꼴·위젯/글쓰기 스킨을 관리합니다.</p>

<h3>탭 구성</h3>
<ol>
  <li><strong>사이트 색상</strong> — 네비 그라데이션, 주요 색상, 푸터 그라데이션, 헤더 배경, 메뉴바 글꼴.</li>
  <li><strong>위젯/글쓰기 스킨</strong> — 메인 위젯 박스 테두리/배경/헤더, 게시판명·더보기·일자·제목·작성자 폰트, 글쓰기 페이지 테두리/폰트.</li>
</ol>

<h3>주요 버튼</h3>
<ul>
  <li><strong>프리셋</strong> — 블루(기본)·그린·레드·다크 4종 중 선택하면 관련 색상이 한 번에 적용됩니다.</li>
  <li><strong>초기화</strong> — 개별 필드를 기본값으로 되돌립니다.</li>
  <li><strong>저장하기</strong> — DB 에 저장. 저장 후 사용자 브라우저에서 새로고침해야 반영됩니다.</li>
</ul>

<h3>팁</h3>
<p>색상은 16진수(#000000) 또는 색상 피커로 입력. 위젯/글쓰기 탭은 <em>실시간 미리보기</em>가 함께 표시되어 변경 결과를 바로 확인할 수 있습니다.</p>`,
  },
  {
    slug: "admin-members",
    title: "회원 관리",
    sortOrder: 105,
    content: `<h2>회원 관리</h2>
<p>등록된 회원을 검색·정렬하고 다중 선택하여 일괄 작업(비밀번호/레벨 변경·삭제)을 수행합니다.</p>

<h3>검색·필터</h3>
<ul>
  <li><strong>검색</strong> — 이름·아이디·이메일로 찾기.</li>
  <li><strong>레벨 필터</strong> — 1~5, 10(일반), 99(비회원) 중 선택.</li>
  <li>정렬 헤더(ID·아이디·이름·레벨·가입일) 클릭으로 오름/내림차순.</li>
</ul>

<h3>일괄 작업</h3>
<ul>
  <li>체크박스로 회원을 선택한 뒤 <strong>비밀번호 일괄 변경 / 레벨 일괄 변경 / 삭제</strong> 중 하나를 실행합니다.</li>
  <li>최고관리자(isAdmin=1) 와 본인은 삭제할 수 없습니다.</li>
  <li>삭제한 회원의 게시글·댓글은 유지되지만 로그인은 불가합니다.</li>
</ul>

<h3>개별 편집</h3>
<p>목록의 <strong>편집</strong> 링크로 해당 회원의 상세 정보(이름·이메일·레벨·권한·연락처 등)와 <em>행정실 권한(회계/연보/관리번호 수정)</em>을 개별 설정할 수 있습니다.</p>`,
  },
  {
    slug: "admin-db",
    title: "DB 관리",
    sortOrder: 106,
    content: `<h2>DB 관리</h2>
<p>방문자 통계·사이트 설정·방문 로그를 직접 조회/수정/삭제합니다. (데이터 이관 탭은 별도)</p>

<h3>탭 구성</h3>
<ul>
  <li><strong>방문자 통계</strong> — 날짜별 방문자 수·페이지뷰. 수동 수정 가능.</li>
  <li><strong>사이트 설정</strong> — 키/값 형태의 설정을 직접 편집하거나 신규 추가.</li>
  <li><strong>방문 로그</strong> — IP·경로·참조자·User-Agent 로 필터링. <em>전체 삭제 버튼은 불가역</em>이므로 주의.</li>
</ul>

<h3>주의</h3>
<ul>
  <li>직접 수정은 즉시 반영됩니다. 실수로 값을 바꾸면 되돌릴 수 없습니다.</li>
  <li>삭제 작업은 확인 대화상자를 반드시 읽고 실행하세요.</li>
  <li>더 복잡한 작업은 "SQL 관리" 페이지를 사용하세요.</li>
</ul>`,
  },
  {
    slug: "admin-sql",
    title: "SQL 관리",
    sortOrder: 107,
    content: `<h2>SQL 관리</h2>
<p>데이터베이스 테이블 구조를 조회/수정하고 데이터를 직접 편집하거나 SQL 쿼리를 실행합니다. <strong>가장 강력하고 위험한 메뉴</strong>이므로 신중히 사용하세요.</p>

<h3>화면 구성</h3>
<ul>
  <li><strong>좌측 패널</strong> — 테이블 목록 (검색 필터, 행 수 표시).</li>
  <li><strong>구조 탭</strong> — 컬럼 정의(Field·Type·Null·Key·Default·Extra·Comment)와 인덱스. <em>컬럼 추가</em> 버튼으로 스키마 변경 가능.</li>
  <li><strong>데이터 탭</strong> — 20/50/100/200건 페이지. 행 클릭 후 셀 수정, 수정/삭제 버튼 (PK 있는 테이블만).</li>
  <li><strong>SQL 탭</strong> — 쿼리 실행. 빠른 삽입 버튼(SELECT·DESCRIBE·SHOW CREATE·COUNT). <kbd>Ctrl+Enter</kbd> 로 실행. 최근 20개 히스토리 자동 저장.</li>
</ul>

<h3>파괴적 쿼리 경고</h3>
<p><code>DROP</code>, <code>DELETE</code>, <code>TRUNCATE</code> 는 실행 전 확인 창이 뜹니다. <strong>되돌릴 수 없습니다</strong>. 반드시 백업 후 진행하세요.</p>

<h3>팁</h3>
<p>PK 가 없는 테이블은 데이터 탭에서 행 수정/삭제를 할 수 없습니다. 이 경우 SQL 탭에서 WHERE 조건을 명시한 UPDATE/DELETE 를 사용하세요.</p>`,
  },
  {
    slug: "admin-backup",
    title: "백업",
    sortOrder: 108,
    content: `<h2>백업</h2>
<p>홈페이지 소스·첨부파일·데이터베이스를 로컬로 다운로드하거나 FTP 원격 서버에 정기 백업합니다.</p>

<h3>백업 종류</h3>
<ul>
  <li><strong>홈페이지 프로그램</strong> — src·prisma·public 등을 <code>backup-source.zip</code> 로 다운로드. (node_modules·.next·data 제외)</li>
  <li><strong>첨부파일</strong> — 게시판 폴더별로 선택해 <code>backup-files.zip</code>.</li>
  <li><strong>DB</strong> — 테이블별로 선택해 <code>backup-db.sql</code>.</li>
  <li><strong>FTP 원격 백업</strong> — 호스트/포트/계정/경로·백업시각·유형·보관기간 설정 후 정기 실행.</li>
</ul>

<h3>정기 백업 활성화</h3>
<ol>
  <li>FTP 설정을 입력하고 <strong>설정 저장</strong>.</li>
  <li>정기 백업을 <em>활성화</em> 로 전환하고 시각·유형·보관기간 선택.</li>
  <li>화면에 표시되는 <strong>crontab 명령</strong>을 서버에 한 번만 등록.</li>
</ol>

<h3>주의</h3>
<p>첨부파일/DB 백업은 최소 1개 이상의 폴더/테이블을 선택해야 실행됩니다. FTP 실패 시 "마지막 백업 정보" 에서 원인을 확인하세요.</p>`,
  },

  // ══════════════════ 권찰회 ══════════════════
  {
    slug: "council-report-entry",
    title: "권찰보고서",
    sortOrder: 200,
    content: `<h2>권찰보고서 (구역별 출석 입력)</h2>
<p>구역(반사) 단위로 주간 출석 현황을 기록합니다. 장년반·중간반이 탭으로 분리되어 있습니다.</p>

<h3>입력 순서</h3>
<ol>
  <li>좌측에서 <strong>구분</strong>(장년반/중간반)과 <strong>구역</strong> 선택.</li>
  <li>상단에서 <strong>날짜</strong> 지정.</li>
  <li>이름·출석 횟수(삼일/오일/주전/주후 등)·성경·기도 입력.</li>
  <li><strong>저장</strong>.</li>
</ol>

<h3>편의 기능</h3>
<ul>
  <li><strong>이전명단 불러오기</strong> — 지난주 명단을 복사해 와서 수정만 하면 됩니다.</li>
  <li><strong>줄추가</strong> — 인원이 늘었을 때 행 추가.</li>
  <li><strong>파일 추가</strong> — 보고 참고용 엑셀·PDF 첨부.</li>
  <li>셀 간 이동은 <kbd>화살표</kbd> 키로 가능.</li>
</ul>

<h3>주의</h3>
<p>이름이 비어 있고 모든 수치가 0 인 행은 저장 시 자동으로 삭제됩니다. 잘못 추가된 빈 행은 그대로 두어도 괜찮습니다.</p>`,
  },
  {
    slug: "council-overall",
    title: "전체출석보고",
    sortOrder: 201,
    content: `<h2>전체출석보고</h2>
<p>전 구역의 출석 집계와 반사별(강사) 성적을 한 화면에서 관리합니다.</p>

<h3>탭 구성</h3>
<ul>
  <li><strong>구역별 성적</strong> — 각 구역의 장년/중간반 출석 수치.</li>
  <li><strong>반사별 성적</strong> — 강사별 주교(주일학교) 참여 기록.</li>
</ul>

<h3>주요 버튼</h3>
<ul>
  <li><strong>조회</strong> — 지정 날짜의 데이터 불러오기.</li>
  <li><strong>전주 명단 불러오기</strong> — 지난주 강사·구역 목록을 복사해 옵니다.</li>
  <li><strong>반사 추가</strong> — 강사 행 추가.</li>
  <li><strong>인쇄 / 엑셀</strong> — 보고서 출력·내보내기.</li>
  <li><strong>저장</strong> — 수정 내용을 DB 에 반영.</li>
</ul>

<h3>주의</h3>
<p>전주(지난주) 데이터는 회색으로 <em>읽기 전용</em> 표시됩니다. 참고용입니다. 오후 설교 내용은 텍스트 필드에 자유롭게 입력하세요.</p>`,
  },
  {
    slug: "council-report",
    title: "보고서 조회",
    sortOrder: 202,
    content: `<h2>보고서 조회</h2>
<p>지정한 기간의 출석 기록을 여러 관점(구역별/반사별/날짜별)으로 조회합니다.</p>

<h3>조회 순서</h3>
<ol>
  <li>시작일·종료일 입력 (기본값 최근 30일).</li>
  <li><strong>조회</strong> 버튼 클릭.</li>
  <li>상단 탭에서 <strong>구역별 / 반사별 / 날짜별</strong> 중 원하는 뷰 선택.</li>
  <li>필요하면 <strong>인쇄</strong> 또는 <strong>엑셀</strong> 로 내려받기.</li>
</ol>

<h3>주의</h3>
<p>조회 버튼을 누르지 않으면 빈 화면이 표시됩니다. 데이터가 없는 기간을 조회하면 "데이터 없음" 메시지가 나옵니다.</p>`,
  },
  {
    slug: "council-live",
    title: "실시간 참여",
    sortOrder: 203,
    content: `<h2>실시간 예배 참여</h2>
<p>온라인 실시간 예배를 시청한 기록을 날짜별로 조회합니다.</p>

<h3>사용법</h3>
<ol>
  <li>시작일·종료일 설정 → <strong>조회</strong>.</li>
  <li>참여가 있었던 날짜 목록이 표시됩니다.</li>
  <li>날짜를 클릭하면 그날 참여자 상세 명단이 펼쳐집니다.</li>
  <li>필요 시 개별 참여 기록 <strong>삭제</strong>.</li>
</ol>

<h3>주의</h3>
<p>같은 색 배지로 표시된 항목은 <em>같은 시간 구간</em>에 참여한 사람들을 의미합니다. 합계 수치는 중복 방문을 포함합니다.</p>`,
  },
  {
    slug: "council-reading",
    title: "재독듣기",
    sortOrder: 204,
    content: `<h2>재독듣기</h2>
<p>성경 낭독 음성 파일과 텍스트를 줄 단위 타임스탬프로 동기화해 재생하는 기능입니다. 프로젝터 화면용 표시도 지원합니다.</p>

<h3>일반 사용자</h3>
<ul>
  <li>좌측 <strong>목록</strong>에서 글 선택 → <strong>재생/일시정지</strong>.</li>
  <li><strong>속도 조절</strong> — 0.5x ~ 2.0x.</li>
  <li>텍스트 줄 클릭 → 해당 타임스탬프로 이동 (재동기화).</li>
  <li><strong>이어쓰기</strong> 토글 — 구간 줄바꿈(OFF) vs 한 문단식(ON).</li>
  <li><strong>표시설정</strong> — 글꼴·크기·박스 크기(프로젝터 프리셋 포함).</li>
</ul>

<h3>관리자</h3>
<ul>
  <li><strong>새 글 등록</strong> — 낭독 본문 + 음성 파일 업로드.</li>
  <li><strong>텍스트 편집</strong> — 인라인 수정.</li>
  <li><strong>음성→텍스트 변환</strong> — Whisper AI 로 자동 전사 + 타임스탬프 생성. <em>수 분 소요</em>.</li>
  <li><strong>구간 교정</strong> — AI 전사 결과의 오류를 수동 보정.</li>
</ul>

<h3>주의</h3>
<p>각 줄이 동기화 단위입니다. 너무 긴 문장은 줄을 나눠야 재생 위치가 정확히 맞습니다. AI 전사는 배경 소음·억양에 따라 오차가 생기므로 "구간 교정"으로 마감하세요.</p>`,
  },
  {
    slug: "council-manage",
    title: "권찰회 관리",
    sortOrder: 205,
    content: `<h2>권찰회 관리 (구분·구역 마스터)</h2>
<p>출석 보고서의 기준이 되는 <strong>구분(부서)</strong> 과 <strong>구역(반사)</strong> 를 관리합니다.</p>

<h3>탭 구성</h3>
<ul>
  <li><strong>구분</strong> — 장년반·중간반 같은 상위 분류. 이름·정렬순서로 추가/수정/삭제.</li>
  <li><strong>구분정보</strong> — 구분별 하위 구역(반사)을 추가/수정/삭제.</li>
</ul>

<h3>주의</h3>
<p>구분 또는 구역을 삭제하면 <strong>소속된 보고서 데이터가 함께 삭제</strong>됩니다. 경고 창을 반드시 확인하세요.</p>`,
  },

  // ══════════════════ 행정실 - 회계 ══════════════════
  {
    slug: "accounting-entry",
    title: "전표입력",
    sortOrder: 300,
    content: `<h2>전표입력</h2>
<p>수입(십일조·헌금 등)과 지출 거래를 항목 단위로 입력·저장합니다.</p>

<h3>입력 순서</h3>
<ol>
  <li>상단에서 <strong>회계단위</strong> 선택.</li>
  <li>탭에서 <strong>수입 / 지출</strong> 구분.</li>
  <li><strong>전표일자</strong> 와 <strong>전표적요</strong>(거래 전체 요약) 입력.</li>
  <li>하단 표에 <strong>계정과목·금액·적요·거래처</strong> 를 항목별로 입력 (행 추가 가능).</li>
  <li><strong>저장</strong>.</li>
</ol>

<h3>편의 기능</h3>
<ul>
  <li><strong>전표번호</strong>는 저장 시 자동 부여됩니다.</li>
  <li>합계는 실시간으로 갱신됩니다.</li>
  <li><strong>오늘의 전표</strong> 목록에서 방금 저장한 전표를 클릭해 바로 수정할 수 있습니다.</li>
</ul>

<h3>주의</h3>
<p>이미 <strong>마감된 월의 전표는 수정 불가</strong>입니다. 항목은 최소 1건 이상 입력해야 저장됩니다.</p>`,
  },
  {
    slug: "accounting-vouchers",
    title: "전표현황",
    sortOrder: 301,
    content: `<h2>전표현황</h2>
<p>입력된 전표를 조회·검색하고 수정/삭제할 수 있습니다.</p>

<h3>필터</h3>
<ul>
  <li>기간(시작일·종료일), 회계단위, 구분(수입/지출), 계정명, 적요/거래처 키워드.</li>
  <li><strong>조회</strong> 버튼으로 적용.</li>
</ul>

<h3>기능</h3>
<ul>
  <li>상단 요약 바: 수입·지출·잔액 합계.</li>
  <li><strong>엑셀</strong> — 현재 결과를 CSV 로 내려받기 (감사 자료용).</li>
  <li>표의 <strong>전표번호</strong> 클릭 → 모달에서 상세 조회, 그 자리에서 수정·삭제.</li>
  <li>자물쇠 아이콘 = 마감된 전표 (읽기 전용).</li>
</ul>`,
  },
  {
    slug: "accounting-report-monthly",
    title: "월별수입지출",
    sortOrder: 302,
    content: `<h2>월별수입지출</h2>
<p>지정한 월의 수입·지출 내역과 전월/차월 이월 잔액을 공식 양식으로 보고합니다.</p>

<h3>조회 순서</h3>
<ol>
  <li>회계단위·연도·월 선택 → 자동 로드.</li>
  <li>구성: <strong>전기이월 → 수입 내역 → 수입합계 → 지출 내역 → 지출합계 → 당월잔액 → 차월이월</strong>.</li>
  <li>필요 시 <strong>인쇄</strong>.</li>
</ol>

<h3>팁</h3>
<p>이 보고서의 이월 숫자가 어긋나면 <strong>이월잔액</strong> 또는 <strong>마감</strong> 화면을 먼저 확인하세요.</p>`,
  },
  {
    slug: "accounting-report-account",
    title: "계정별현황",
    sortOrder: 303,
    content: `<h2>계정별현황</h2>
<p>기간 내 각 계정과목별 수입·지출 합계를 한 표에서 비교합니다.</p>

<h3>사용법</h3>
<ul>
  <li>회계단위·시작일·종료일·구분(전체/수입/지출) 선택 → 자동 조회.</li>
  <li>컬럼: <strong>코드 · 계정명 · 수입금액 · 지출금액</strong>.</li>
  <li>하단에 수입 소계·지출 소계·순수익(수입-지출) 자동 계산.</li>
  <li><strong>인쇄</strong> 버튼 제공.</li>
</ul>

<h3>활용</h3>
<p>어떤 계정에 지출이 몰려 있는지, 어느 수입원이 큰지 한눈에 파악할 때 사용합니다.</p>`,
  },
  {
    slug: "accounting-report-daily",
    title: "일자별현황",
    sortOrder: 304,
    content: `<h2>일자별현황</h2>
<p>기간 내 매일의 수입·지출·누적 잔액을 추적하고, 각 날짜의 세부 거래까지 확인합니다.</p>

<h3>사용법</h3>
<ul>
  <li>회계단위·시작일·종료일 선택.</li>
  <li>첫 행은 <strong>전기이월</strong>.</li>
  <li>날짜 행을 <strong>클릭</strong>하면 그날의 전표번호·계정명·금액이 펼쳐집니다.</li>
  <li><strong>인쇄</strong> 시 모든 행이 자동으로 펼쳐진 상태로 출력됩니다.</li>
</ul>

<h3>언제 유용한가</h3>
<p>특정 날짜의 현금 흐름 또는 잔액을 확인할 때, 거래의 시간 순 흐름을 추적할 때 쓰세요.</p>`,
  },
  {
    slug: "accounting-settlement",
    title: "결산현황",
    sortOrder: 305,
    content: `<h2>결산현황</h2>
<p>월별 또는 연간 결산을 공식 결산서 형태로 출력합니다.</p>

<h3>모드</h3>
<ul>
  <li><strong>월별결산</strong> — 단일 월. 전기이월 → 수입 → 지출 → 당월잔액 → 차기이월.</li>
  <li><strong>연간결산</strong> — 12개월을 한 표에 나란히 비교.</li>
</ul>

<h3>사용법</h3>
<ol>
  <li>회계단위·연도 선택.</li>
  <li>(월별 모드일 때) 월 선택.</li>
  <li>월별/연간 토글로 모드 전환.</li>
  <li><strong>인쇄</strong> 로 결산서 출력.</li>
</ol>

<h3>주의</h3>
<p>아직 마감되지 않은 월은 <em>잠정 수치</em>입니다. 공식 보고 전에는 해당 월의 마감 상태를 먼저 확인하세요.</p>`,
  },
  {
    slug: "accounting-closing",
    title: "마감",
    sortOrder: 306,
    content: `<h2>마감 (월별 회계마감)</h2>
<p>특정 월을 마감하면 그 달의 전표는 <strong>수정/삭제가 불가</strong>해집니다. 회계 기간을 공식화하는 기능입니다.</p>

<h3>사용법</h3>
<ol>
  <li>회계단위·연도 선택.</li>
  <li>월별 표에서 <em>미마감</em>(노란색) 월의 숫자를 확인.</li>
  <li>문제 없으면 <strong>마감</strong> 버튼 클릭.</li>
</ol>

<h3>표에 표시되는 것</h3>
<ul>
  <li>월 / 이월잔액 / 수입합계 / 지출합계 / 마감잔액.</li>
  <li>마감 상태: "마감완료"(녹색) · "미마감"(노란색).</li>
  <li>마감일·마감자.</li>
</ul>

<h3>해제</h3>
<p>잘못 마감했다면 <strong>해제</strong> 버튼으로 재오픈할 수 있지만 <em>관리자 권한</em>이 필요합니다. 해제 후에도 전표 로그는 유지되니 주의해서 사용하세요.</p>`,
  },
  {
    slug: "accounting-accounts",
    title: "계정과목",
    sortOrder: 307,
    content: `<h2>계정과목</h2>
<p>수입/지출 계정 코드를 <strong>트리(계층) 구조</strong>로 관리합니다.</p>

<h3>화면 구성</h3>
<ul>
  <li><strong>좌측</strong> — 계정 트리. 확장/축소 가능.</li>
  <li><strong>우측</strong> — 선택한 계정의 상세 폼: 코드·이름·구분(차변 D/대변 C)·상위계정·레벨·정렬순서·설명·사용 여부.</li>
</ul>

<h3>작업</h3>
<ul>
  <li><strong>하위추가</strong> — 선택한 계정의 자식 계정을 생성.</li>
  <li><strong>수정</strong> — 폼에서 변경 후 저장.</li>
  <li><strong>삭제</strong> — 하위 계정이 없을 때만 가능.</li>
</ul>

<h3>주의</h3>
<p><strong>상위 계정</strong>에는 직접 거래를 입력할 수 없습니다. 항상 말단 계정에 전표를 기록하세요. 트리 구조를 바꾸면 기존 보고서 집계에 영향이 있으니 신중히 작업합니다.</p>`,
  },
  {
    slug: "accounting-units",
    title: "회계단위",
    sortOrder: 308,
    content: `<h2>회계단위</h2>
<p>회계 단위(예: 일반회계·건축비·선교비 등)를 관리합니다. 전표·계정과목·마감·보고서는 모두 이 단위를 기준으로 작동합니다.</p>

<h3>사용법</h3>
<ul>
  <li>좌측 목록에서 기존 단위를 확인(코드·이름·정렬·사용여부).</li>
  <li>우측 폼에서 신규 추가 또는 수정 → <strong>저장</strong>.</li>
  <li>더 이상 사용하지 않는 단위는 <em>사용 여부</em> 체크를 해제해 숨기세요.</li>
</ul>

<h3>주의</h3>
<p>회계단위를 삭제하면 여기에 연결된 전표·계정·이월이 모두 영향을 받습니다. 가급적 <em>삭제 대신 사용 해제</em> 를 권장합니다.</p>`,
  },
  {
    slug: "accounting-balance",
    title: "이월잔액",
    sortOrder: 309,
    content: `<h2>이월잔액</h2>
<p>새 회계연도의 <strong>시작 잔액</strong>을 설정합니다. 이 값이 월별 보고서·결산의 기준이 됩니다.</p>

<h3>사용법</h3>
<ol>
  <li>회계단위 선택.</li>
  <li>회계연도 선택.</li>
  <li>금액 입력 (음수 가능) → <strong>저장</strong>.</li>
</ol>

<h3>언제 사용하나</h3>
<ul>
  <li>전년도 결산을 마친 뒤 신년 초 한 번 입력.</li>
  <li>이월 숫자가 어긋나 월별수입지출/결산현황의 잔액이 맞지 않을 때 재설정.</li>
</ul>

<h3>주의</h3>
<p>이월잔액을 변경하면 <strong>모든 월별 보고서의 누적 잔액이 다시 계산</strong>됩니다. 회계 담당자와 상의한 뒤 수정하세요.</p>`,
  },

  // ══════════════════ 행정실 - 연보관리 ══════════════════
  {
    slug: "offering-members",
    title: "관리번호",
    sortOrder: 400,
    content: `<h2>관리번호 (기부자 명부)</h2>
<p>헌금을 기록하기 위한 기부자 목록과 <strong>관리번호</strong>를 관리합니다.</p>

<h3>사용법</h3>
<ul>
  <li><strong>검색</strong>(이름) / <strong>구역 필터</strong> 로 회원 찾기.</li>
  <li><strong>신규등록</strong> — 번호(자동 또는 수동)·이름·구역 등 입력.</li>
  <li>행 클릭 → 수정 모달에서 정보 변경 가능.</li>
  <li><strong>공동번호</strong> — 가족 구성원을 묶어 한 장의 기부금 영수증으로 발급할 때 사용.</li>
</ul>

<h3>주의</h3>
<p><strong>연보 기록이 있는 회원은 삭제할 수 없습니다.</strong> 사용 여부 체크를 해제해 목록에서 숨기세요.</p>`,
  },
  {
    slug: "offering-donor-info",
    title: "기부자정보",
    sortOrder: 401,
    content: `<h2>기부자정보 (영수증 발급용)</h2>
<p>국세청 기부금영수증(서식 29호)과 소속증명서 발급에 필요한 상세 정보를 관리합니다.</p>

<h3>편집 항목</h3>
<ul>
  <li>성명·구역·주민등록번호·주소·연락처·이메일.</li>
</ul>

<h3>보안</h3>
<ul>
  <li>주민등록번호는 <strong>AES-256-GCM 암호화</strong>로 저장됩니다.</li>
  <li>목록에서는 <em>마스킹</em> 된 형태로만 보이고, 수정 모달에서만 원본 확인이 가능합니다.</li>
  <li>이 화면에 접근하려면 <em>관리번호 수정 권한</em>(accMemberEditAccess)이 필요합니다.</li>
</ul>

<h3>주의</h3>
<p>주민번호·주소가 누락되면 기부금영수증과 소속증명서를 출력할 수 없습니다. 연말정산 시즌 전에 일괄 보완하세요.</p>`,
  },
  {
    slug: "offering-entry",
    title: "연보입력",
    sortOrder: 402,
    content: `<h2>연보입력 (헌금 기록)</h2>
<p>매주 일자별 헌금을 일괄 기록합니다. 회원 한 명당 6종 연보(주일·십일조·감사·특별·오일·절기) 행이 자동 생성됩니다.</p>

<h3>입력 순서</h3>
<ol>
  <li><strong>연보일자</strong> 입력 (기본값 오늘).</li>
  <li>개인번호 입력 또는 <strong>회원 검색</strong> 팝업으로 선택.</li>
  <li>자동 생성된 6행에 금액·비고 입력.</li>
  <li>다음 회원 번호 입력 → 행 추가 반복.</li>
  <li><strong>저장</strong>.</li>
</ol>

<h3>키보드 단축</h3>
<ul>
  <li><kbd>↑</kbd> <kbd>↓</kbd> — 행 이동</li>
  <li><kbd>←</kbd> <kbd>→</kbd> — 열(금액·비고) 이동</li>
  <li>마지막 행에서 <kbd>↓</kbd> — 자동 행 추가</li>
</ul>

<h3>주의</h3>
<p>금액이 0 인 행은 저장되지 않습니다. 비고는 특이사항(감사 사유 등)을 간단히 메모하세요.</p>`,
  },
  {
    slug: "offering-list",
    title: "연보내역",
    sortOrder: 403,
    content: `<h2>연보내역</h2>
<p>헌금 기록을 <strong>세 가지 관점</strong>에서 조회·검색합니다.</p>

<h3>탭별 용도</h3>
<ul>
  <li><strong>개인별</strong> — 회원 한 명의 특정 기간 연보 전체.</li>
  <li><strong>일자별</strong> — 특정 날짜의 연보를 종류별로 그룹화.</li>
  <li><strong>기간별</strong> — 기간 + 연보 종류 필터로 조건에 맞는 모든 내역.</li>
</ul>

<h3>주의</h3>
<p>권한 등급에 따라 성명·번호 표시 여부가 달라집니다. 개인정보 유출이 우려되는 화면은 <em>화면 캡처·공유</em>를 삼가세요.</p>`,
  },
  {
    slug: "offering-thanks",
    title: "감사연보현황",
    sortOrder: 404,
    content: `<h2>감사연보현황</h2>
<p>여러 연보 종류 중 <strong>감사연보</strong> 만 따로 추려서 조회·인쇄합니다. 감사 보고 용도입니다.</p>

<h3>사용법</h3>
<ol>
  <li>시작일·종료일 입력 → <strong>조회</strong>.</li>
  <li>결과: 일자·번호·성명·구역·금액·감사연보내역(비고) + 합계.</li>
  <li>필요 시 <strong>인쇄</strong>.</li>
</ol>

<h3>주의</h3>
<p>이 메뉴는 <em>관리번호 수정 권한</em>(accMemberEditAccess)이 있어야 접근 가능합니다.</p>`,
  },
  {
    slug: "offering-summary",
    title: "연보집계",
    sortOrder: 405,
    content: `<h2>연보집계</h2>
<p>개인별·일자별·월별·기간별로 헌금을 <strong>통계 표</strong>로 집계합니다.</p>

<h3>탭별 용도</h3>
<ul>
  <li><strong>개인별</strong> — 회원 + 기간 → 종류별 금액 + 합계.</li>
  <li><strong>일자별</strong> — 기간 → 날짜 × 연보 종류 표.</li>
  <li><strong>월별</strong> — 연도 선택 → 12개월 합계.</li>
  <li><strong>기간별</strong> — 기간 → 연보 종류별 총합.</li>
</ul>

<h3>활용</h3>
<p>월별·종류별 흐름을 보며 <em>감사 예산</em> 또는 <em>헌금 동향</em>을 파악할 때 사용합니다.</p>`,
  },
  {
    slug: "offering-receipt",
    title: "기부금영수증",
    sortOrder: 406,
    content: `<h2>기부금영수증 (서식 29호)</h2>
<p>국세청 서식 29호에 맞춘 연말정산용 기부금영수증을 출력합니다.</p>

<h3>사용법</h3>
<ol>
  <li><strong>연도</strong> 선택.</li>
  <li>회원 검색 → 선택.</li>
  <li>영수증 미리보기가 자동 생성됩니다. (월별 합계 자동 계산)</li>
  <li><strong>발행일 / 기부금 수령인</strong>을 필요에 따라 수정.</li>
  <li><strong>인쇄</strong>.</li>
</ol>

<h3>영수증 규칙</h3>
<ul>
  <li>일련번호: <code>YY-memberId(3자리)</code>.</li>
  <li>월별 합계는 그 달의 <em>마지막 일요일</em> 기준으로 표기됩니다.</li>
  <li>가족 <strong>공동번호</strong>가 설정된 회원은 <em>가족 전원 합산</em> 영수증이 발급됩니다.</li>
</ul>

<h3>주의</h3>
<p>주민등록번호·주소가 <em>기부자정보</em>에 등록돼 있어야 출력 가능합니다. 누락된 회원은 먼저 기부자정보 화면에서 보완하세요.</p>`,
  },
  {
    slug: "offering-certificate",
    title: "소속증명서",
    sortOrder: 407,
    content: `<h2>소속증명서</h2>
<p>교인 소속증명서를 발급합니다. 은행·관공서 서류 제출에 사용됩니다.</p>

<h3>사용법</h3>
<ol>
  <li><strong>발급일</strong> 입력.</li>
  <li>회원 검색 → 선택 → 증명서 미리보기 자동 표시.</li>
  <li><strong>발행자</strong>(2줄: 단체명·직함·성명) 필요시 수정.</li>
  <li><strong>인쇄</strong>.</li>
</ol>

<h3>서식</h3>
<ul>
  <li>발급번호: <code>YYYY-MM-memberId</code>.</li>
  <li>이름·주민등록번호·주소 + 증명 문구 + 발급일·발행자.</li>
</ul>

<h3>주의</h3>
<p>주민등록번호·주소가 없으면 경고가 뜨고 출력할 수 없습니다. <em>기부자정보</em>에서 먼저 등록하세요. 이 메뉴는 <em>관리번호 수정 권한</em>이 필요합니다.</p>`,
  },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const page of PAGES) {
    const existing = await prisma.helpPage.findUnique({ where: { slug: page.slug } });
    await prisma.helpPage.upsert({
      where: { slug: page.slug },
      update: { title: page.title, content: page.content, sortOrder: page.sortOrder },
      create: page,
    });
    if (existing) updated++;
    else created++;
  }
  console.log(`완료 — 신규 ${created}개, 업데이트 ${updated}개 (총 ${PAGES.length}개)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
