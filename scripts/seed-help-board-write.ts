/**
 * 게시판 글쓰기 도움말(slug=board-write) 콘텐츠 upsert 스크립트.
 *
 * 사용법:
 *   npx tsx scripts/seed-help-board-write.ts
 *
 * 기존 레코드가 있으면 content 만 덮어쓰고, 없으면 새로 생성한다.
 * 스크린샷은 관리자 도움말 편집기에서 직접 끼워 넣어 보강.
 */
import prisma from "../src/lib/db";

const SLUG = "board-write";
const TITLE = "글쓰기 도움말";

const CONTENT = `<h2>글쓰기 에디터 사용법</h2>
<p>편집 영역 상단 툴바의 각 아이콘 기능입니다. 아이콘 위에 마우스를 올리면 툴팁으로도 표시됩니다.</p>

<h3>1. 실행취소 / 재실행</h3>
<ul>
  <li><strong>↩ 실행취소</strong> — 직전 편집을 되돌립니다. (Ctrl+Z)</li>
  <li><strong>↪ 재실행</strong> — 취소한 편집을 다시 적용합니다. (Ctrl+Shift+Z)</li>
</ul>

<h3>2. 글꼴 · 글자 크기 · 문단 스타일</h3>
<ul>
  <li><strong>글꼴 ▾</strong> — 맑은 고딕·돋움·굴림·바탕·나눔고딕·Arial 등 12종. "기본"을 고르면 사이트 기본 글꼴로 돌아갑니다.</li>
  <li><strong>14 ▾ (글자 크기)</strong> — 9 px ~ 48 px 중 선택. 숫자 부분에 현재 크기가 표시됩니다. "기본"으로 해제.</li>
  <li><strong>본문 ▾</strong> — 본문 / 제목 1~4 전환.</li>
</ul>

<h3>3. 텍스트 서식</h3>
<ul>
  <li><strong>B</strong> 굵게 · <strong><em>I</em></strong> 기울임 · <strong><u>U</u></strong> 밑줄 · <strong><s>S</s></strong> 취소선</li>
  <li>선택 후 다시 누르면 해제됩니다. 활성 상태면 버튼이 파랗게 표시됩니다.</li>
</ul>

<h3>4. 글자 색 / 배경 색</h3>
<ul>
  <li><strong>A<sub>색</sub> ▾</strong> — 팔레트 25색에서 글자 색을 고릅니다. 하단 "색상 제거"로 해제.</li>
  <li><strong>A<sub>배경</sub> ▾</strong> — 형광펜 강조. 같은 방식으로 해제 가능.</li>
</ul>

<h3>5. 정렬</h3>
<ul>
  <li><strong>≡ 좌측</strong> · <strong>≡ 중앙</strong> · <strong>≡ 우측</strong> — 현재 문단 정렬을 바꿉니다.</li>
</ul>

<h3>6. 목록</h3>
<ul>
  <li><strong>●</strong> 글머리 기호 목록</li>
  <li><strong>1.</strong> 번호 매기기 목록</li>
  <li>같은 버튼을 다시 누르면 목록이 해제됩니다.</li>
</ul>

<h3>7. 삽입 도구</h3>
<ul>
  <li><strong>🖼 이미지</strong> — 파일 선택창이 열립니다. <em>여러 장 동시 선택 가능</em>.
    <ul>
      <li>삽입 후 이미지를 클릭하면 <strong>워드처럼</strong> 크기 조절 핸들·왼쪽/가운데/오른쪽·글 흐름 옵션이 뜹니다.</li>
      <li>본문에 <strong>이미지를 붙여넣기(Ctrl+V)</strong> 하거나 <strong>드래그앤드롭</strong>으로 바로 업로드됩니다.</li>
    </ul>
  </li>
  <li><strong>🎬 동영상/음성 파일</strong> — 내 PC의 mp4·mp3 등을 업로드해 삽입. 드래그앤드롭·붙여넣기 지원.</li>
  <li><strong>📺 동영상/음성 URL</strong> — 외부 링크 삽입.
    <ul>
      <li>YouTube·Vimeo 주소는 자동으로 플레이어 임베드로 변환됩니다.</li>
      <li>mp4/mp3 직접 링크도 인식.</li>
      <li>미디어로 인식되지 않을 때만 일반 링크로 삽입할지 다시 묻습니다.</li>
    </ul>
  </li>
  <li><strong>🔗 링크</strong> — 선택한 글자에 링크를 걸거나, 선택 없이 누르면 URL + 표시 텍스트를 물어본 뒤 삽입합니다. URL 을 비워 저장하면 링크가 해제됩니다.</li>
  <li><strong>▦ 표</strong> — 3×3 표를 삽입합니다(첫 행은 머리글).</li>
  <li><strong>─ 구분선</strong> — 가로 구분선을 넣습니다.</li>
</ul>

<h3>8. 표 편집 (표 안에 커서가 있을 때만 나타남)</h3>
<ul>
  <li><strong>+열 / +행</strong> — 현재 위치 뒤로 열·행 추가</li>
  <li><strong>-열 / -행</strong> — 현재 열·행 삭제</li>
  <li><strong>✕표</strong> — 표 전체 삭제</li>
</ul>

<h3>9. 꿀팁</h3>
<ul>
  <li>이미지·동영상·음성 파일은 툴바를 거치지 않고 <strong>편집 영역에 바로 끌어다 놓거나 붙여넣어도</strong> 업로드됩니다.</li>
  <li>이미지/미디어 삽입 후 주변을 클릭하면 배치(왼쪽·가운데·오른쪽·글 흐름)를 워드처럼 바꿀 수 있습니다.</li>
  <li>단축키: <kbd>Ctrl+B</kbd> 굵게 · <kbd>Ctrl+I</kbd> 기울임 · <kbd>Ctrl+U</kbd> 밑줄 · <kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Shift+Z</kbd> 실행취소/재실행.</li>
</ul>`;

async function main() {
  const existing = await prisma.helpPage.findUnique({ where: { slug: SLUG } });
  const result = await prisma.helpPage.upsert({
    where: { slug: SLUG },
    update: { title: TITLE, content: CONTENT },
    create: { slug: SLUG, title: TITLE, content: CONTENT, sortOrder: 0 },
  });
  console.log(
    `${existing ? "업데이트" : "생성"} 완료: id=${result.id} slug=${result.slug} title=${result.title} (${result.content.length} chars)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
