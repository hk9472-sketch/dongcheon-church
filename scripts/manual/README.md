# 매뉴얼(도움말) 캡처 도구

행정실 · 연보관리 · 월정관리 매뉴얼의 화면 캡처를 **가상 데이터**로 다시 찍는 도구입니다.
도움말은 로그인 없이 공개되므로 실제 교인 이름 · 금액 · 주민번호가 담긴 운영 화면을 캡처하면 안 됩니다.

- 매뉴얼 내용: `scripts/help/{accounting,offering,dues}.ts`
- 이미지: `public/help/<영역>/*.png`
- 서버 반영: `npx tsx scripts/seed-help-manuals.ts [accounting|offering|dues]`

## 다시 찍는 순서 (개발 PC)

1. 캡처용 MySQL — 운영 DB 와 섞이지 않게 별도 포트 · 별도 DB(`dc_manual`) 를 씁니다.
   ```bash
   mysqld --initialize-insecure --datadir=<임시폴더>/mysqldata
   mysqld --datadir=<임시폴더>/mysqldata --port=3399 --bind-address=127.0.0.1 --mysqlx=OFF
   mysql -h127.0.0.1 -P3399 -uroot -e "CREATE DATABASE dc_manual CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   ```
2. 스키마 + 가상 데이터 (`seed-demo.ts` 는 DB 이름이 `dc_manual` 이 아니면 실행을 멈춥니다)
   ```bash
   export DATABASE_URL="mysql://root@127.0.0.1:3399/dc_manual"
   export RRN_ENCRYPTION_KEY=<임의의 64자리 hex — 운영 키 쓰지 말 것>
   npx prisma db push --skip-generate
   npx tsx scripts/manual/seed-demo.ts
   ```
3. 앱 실행 — 이 PC 는 `next dev` 가 `.next` 파일 잠금(EPERM)으로 실패하므로 빌드 후 실행합니다.
   ```bash
   npx next build && npx next start -p 3100
   ```
4. 이체 · 회계 간 대체 · 대사 · 월마감 · 일별결산 데이터는 실제 API 로 넣습니다.
   ```bash
   npm i --no-save playwright-core@1.55.1   # 캡처용 (package.json 에 넣지 않음)
   node scripts/manual/capture/api-seed.mjs
   ```
5. 캡처 → 최적화 → 매뉴얼 반영
   ```bash
   node scripts/manual/capture/specs-accounting.mjs            # 일부만: 파일명 일부를 인자로 (예: g-entry)
   NOREAUTH=1 node scripts/manual/capture/specs-accounting.mjs # 비밀번호 확인 화면
   node scripts/manual/capture/specs-offering.mjs
   node scripts/manual/capture/specs-dues.mjs
   node scripts/manual/capture/optimize.mjs                     # 팔레트 PNG (약 60% 축소)
   npx tsx scripts/seed-help-manuals.ts                         # 가상 DB 에서 미리보기
   ```
   - 다른 포트로 띄웠으면 `CAP_BASE=http://localhost:3101`, 브라우저 경로는 `CAP_BROWSER`.
   - 캡처 중 도움말 팝업이 열려 있으면 `! 도움말 팝업이 열린 상태` 경고가 나옵니다(제목 옆 매뉴얼 버튼을 누른 것).
   - 빨간 번호는 spec 의 `marks` 순서와 매뉴얼 본문의 `num(n)` 을 맞춥니다.
