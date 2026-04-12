// ============================================================
// 레거시 pkistdc.net 방문자 카운터 → site_settings 가져오기
// ============================================================
//
// 사용법:
//   node scripts/import-visitor-count.js
//
// 설명:
//   기존 pkistdc.net (제로보드 4.1) 사이트의 총 방문자 수를
//   가져와서 새 시스템의 site_settings 테이블에 저장합니다.
//
// 주의:
//   - pkistdc.net은 EUC-KR 인코딩을 사용합니다
//   - HTTPS는 에러 페이지로 리다이렉트되므로 HTTP를 사용합니다
//   - 사이트가 접속 불가능한 경우 수동으로 값을 설정하세요
//
// 수동 설정:
//   node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.siteSetting.upsert({where:{key:'visitor_base_count'}, create:{key:'visitor_base_count',value:'12345'}, update:{value:'12345'}}).then(r=>{console.log(r);p.$disconnect();})"
//
// ============================================================

const { PrismaClient } = require('@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

// 시도할 URL 목록 (순서대로 시도)
const URLS = [
  'http://www.pkistdc.net/bbs/index.php',
  'http://pkistdc.net/bbs/index.php',
];

// HTTP 요청 타임아웃 (밀리초)
const REQUEST_TIMEOUT = 15000;

/**
 * HTTP GET 요청으로 페이지를 가져옵니다.
 * EUC-KR 인코딩을 UTF-8로 디코딩합니다.
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    console.log(`  요청 중: ${url}`);

    const req = http.get(url, { timeout: REQUEST_TIMEOUT }, (res) => {
      // 리다이렉트 처리
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`  리다이렉트: ${res.headers.location}`);
        // 리다이렉트가 https인 경우 스킵
        if (res.headers.location.startsWith('https')) {
          reject(new Error('HTTPS로 리다이렉트됨 (에러 페이지)'));
          return;
        }
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        // EUC-KR → UTF-8 디코딩 (Node.js 내장 TextDecoder 사용)
        try {
          const decoder = new TextDecoder('euc-kr');
          const html = decoder.decode(buffer);
          resolve(html);
        } catch (err) {
          // TextDecoder가 euc-kr을 지원하지 않는 경우 fallback
          // (Node.js에 ICU가 포함된 경우 지원됨)
          console.warn('  TextDecoder euc-kr 미지원, latin1로 시도...');
          resolve(buffer.toString('latin1'));
        }
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`타임아웃 (${REQUEST_TIMEOUT}ms)`));
    });

    req.on('error', reject);
  });
}

/**
 * HTML에서 방문자 카운터 숫자를 추출합니다.
 *
 * 제로보드 기반 사이트의 일반적인 카운터 패턴:
 *   - "TOTAL : 12345"
 *   - "총 방문 : 12345"
 *   - "전체 : 12,345"
 *   - 카운터 이미지 (counter/N.gif 패턴)
 *   - "total" 근처의 숫자
 */
function extractVisitorCount(html) {
  // 패턴 1: "TOTAL : 숫자" 또는 "total : 숫자" (콜론 전후 공백 유연)
  let match = html.match(/TOTAL\s*[:：]\s*([\d,]+)/i);
  if (match) {
    return parseInt(match[1].replace(/,/g, ''), 10);
  }

  // 패턴 2: 한글 "총 방문" 또는 "전체" + 숫자
  match = html.match(/(?:총\s*방문|전체|총방문자|총\s*카운터)\s*[:：]?\s*([\d,]+)/);
  if (match) {
    return parseInt(match[1].replace(/,/g, ''), 10);
  }

  // 패턴 3: 카운터 이미지 패턴 (counter/0.gif ~ counter/9.gif)
  // 예: <img src="counter/1.gif"><img src="counter/2.gif"> → 12
  const counterImgPattern = /counter\/(\d)\.(?:gif|png|jpg)/gi;
  const digits = [];
  let imgMatch;
  while ((imgMatch = counterImgPattern.exec(html)) !== null) {
    digits.push(imgMatch[1]);
  }
  if (digits.length > 0) {
    return parseInt(digits.join(''), 10);
  }

  // 패턴 4: "T O T A L" (글자 사이 공백) + 숫자
  match = html.match(/T\s*O\s*T\s*A\s*L\s*[:：]?\s*([\d,\s]+)/i);
  if (match) {
    return parseInt(match[1].replace(/[,\s]/g, ''), 10);
  }

  // 패턴 5: "visit" 또는 "visitor" 근처의 큰 숫자 (5자리 이상)
  match = html.match(/visit(?:or|ors|count)?\s*[:：]?\s*([\d,]+)/i);
  if (match) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (num >= 100) return num;
  }

  // 패턴 6: "today" / "yesterday" / "total" 블록에서 total 값 추출
  // 제로보드 카운터 스킨에서 자주 사용하는 패턴
  match = html.match(/total[^<\d]{0,30}([\d,]+)/i);
  if (match) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (num >= 100) return num;
  }

  return null;
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('============================================');
  console.log('  pkistdc.net 방문자 카운터 가져오기');
  console.log('============================================\n');

  let html = null;
  let fetchedFrom = null;

  // URL 목록을 순서대로 시도
  for (const url of URLS) {
    try {
      html = await fetchPage(url);
      fetchedFrom = url;
      console.log(`  성공: ${url} (${html.length} bytes)\n`);
      break;
    } catch (err) {
      console.log(`  실패: ${url} - ${err.message}`);
    }
  }

  if (!html) {
    console.error('\n[오류] 모든 URL 접속 실패.');
    console.error('수동으로 방문자 수를 설정하세요:');
    console.error('');
    console.error('  node -e "const {PrismaClient} = require(\'@prisma/client\'); const p = new PrismaClient(); p.siteSetting.upsert({where:{key:\'visitor_base_count\'}, create:{key:\'visitor_base_count\',value:\'여기에숫자\'}, update:{value:\'여기에숫자\'}}).then(r=>{console.log(r);p.$disconnect();})"');
    console.error('');
    await prisma.$disconnect();
    process.exit(1);
  }

  // 방문자 수 추출 시도
  const count = extractVisitorCount(html);

  if (count === null) {
    console.error('[오류] HTML에서 방문자 카운터를 찾을 수 없습니다.');
    console.error(`가져온 URL: ${fetchedFrom}`);
    console.error('');
    console.error('HTML 내용 중 "total" 또는 "카운" 포함 부분:');

    // 디버깅용: total/카운 근처 텍스트 출력
    const lines = html.split('\n');
    lines.forEach((line, i) => {
      if (/total|카운|방문|visit|counter/i.test(line)) {
        const trimmed = line.trim().substring(0, 200);
        if (trimmed) {
          console.error(`  [${i + 1}] ${trimmed}`);
        }
      }
    });

    console.error('');
    console.error('수동으로 방문자 수를 설정하세요:');
    console.error('  node -e "const {PrismaClient} = require(\'@prisma/client\'); const p = new PrismaClient(); p.siteSetting.upsert({where:{key:\'visitor_base_count\'}, create:{key:\'visitor_base_count\',value:\'12345\'}, update:{value:\'12345\'}}).then(r=>{console.log(r);p.$disconnect();})"');
    console.error('');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`방문자 카운터 발견: ${count.toLocaleString()}`);
  console.log('');

  // DB에 저장
  try {
    const result = await prisma.siteSetting.upsert({
      where: { key: 'visitor_base_count' },
      create: {
        key: 'visitor_base_count',
        value: String(count),
      },
      update: {
        value: String(count),
      },
    });

    console.log('site_settings 테이블 업데이트 완료:');
    console.log(`  key   = ${result.key}`);
    console.log(`  value = ${result.value}`);
    console.log('');
    console.log('============================================');
    console.log('  완료!');
    console.log('============================================');
  } catch (err) {
    console.error('[오류] DB 업데이트 실패:', err.message);
    console.error('');
    console.error('.env 파일의 DATABASE_URL을 확인하고,');
    console.error('prisma db push 또는 prisma migrate가 실행되었는지 확인하세요.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('예기치 않은 오류:', err);
  prisma.$disconnect();
  process.exit(1);
});
