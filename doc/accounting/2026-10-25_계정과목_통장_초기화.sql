-- ============================================================
-- 2026-10-25 회계 재구성 — 계정과목 재정의 + 통장 + 2026 이월잔액
--   전제: 스키마 배포(dcup → prisma db push) 후 실행.
--   ★ 2026-10-25 운영 DB 적용 완료 (MCP, 문장 단위 실행 · 결과 검증)
--   기존 회계 데이터(전표 44건: 연보 자동반영 테스트분)는 사용자 확인으로 폐기.
--   계정 행은 id 를 유지한 채 코드만 바꾼다 (연보·월정 매핑이 id 참조).
--   근거: 2025 결산서(사진) ↔ 외부 P/L 2025 계정값 대조 — 31/33줄 일치,
--         나머지 2줄(전기세·수도세)은 건물공과금 898,678 차감분과 정확히 일치.
-- ============================================================

-- 0) 기존 전표 폐기 (항목은 cascade 지만 명시적으로 먼저 삭제)
DELETE FROM acc_voucher_items;
DELETE FROM acc_vouchers;

-- 회계단위 순서 = 결산서 순서 (십일조 → 일반 → 건축 → 전도 → 주일학교)
UPDATE acc_units SET sortOrder = CASE id WHEN 2 THEN 1 WHEN 1 THEN 2 WHEN 3 THEN 3 WHEN 5 THEN 4 WHEN 4 THEN 5 END;
-- 결산서 명칭에 맞춤
UPDATE acc_units SET name = '주일학교회계' WHERE id = 4;

-- ── 1) 일반회계(unit 1) — 외부 회계사이트 코드 채택 ──
UPDATE acc_accounts SET code='1006', level=1, sortOrder=40 WHERE id=4;            -- 특별연보 (1003→1006)
UPDATE acc_accounts SET code='1005', level=1, sortOrder=20 WHERE id=3;            -- 감사연보
UPDATE acc_accounts SET code='1007', level=1, sortOrder=30 WHERE id=12;           -- 오일연보
UPDATE acc_accounts SET code='1015', level=1, sortOrder=50 WHERE id=13;           -- 절기연보 (하위 부활/맥추/추수/성탄 유지)
UPDATE acc_accounts SET code='1003', level=1, sortOrder=10 WHERE id=1;            -- 주일연보
UPDATE acc_accounts SET level=2 WHERE id IN (5,6,7,8);

INSERT INTO acc_accounts (unitId, code, name, type, level, sortOrder, isActive, reportName, reportDetail, description) VALUES
 (1,'1028','이자수입','D',1,60,1,NULL,0,NULL),
 (1,'1035','잡수입','D',1,70,1,'잡수입(찬조금 등)',0,NULL),
 (1,'1038','환급금','D',1,80,1,NULL,0,NULL),
 (1,'1039','건물공과금','D',1,90,0,NULL,0,'사용 중지 — 사택·3층 공과금 실비는 해당 지출(전기세·수도세)에 음수(환급)로 입력. 2025 결산서도 전기·수도세에서 차감'),
 (1,'1041','기타수입(태양광배상금)','D',1,100,1,'태양광손해배상금',0,NULL),
 (1,'2055','건물관리비','C',1,10,1,NULL,0,NULL),
 (1,'2059','제세공과금','C',1,20,1,NULL,1,'결산서에서 하위 펼침'),
 (1,'2060','차량비','C',1,30,1,'차량',1,'결산서에서 하위 펼침'),
 (1,'2073','난방연료비','C',1,40,1,'난방 연료비',0,NULL),
 (1,'2058','비품','C',1,50,1,'비품비',0,'결산서 한 줄 = 비품비 + 별관비품'),
 (1,'2061','목회활동비','C',1,60,1,NULL,0,NULL),
 (1,'2062','집회지원','C',1,70,1,'집회 지원',0,'결산서 한 줄 = 집회지원비 + 집회경비'),
 (1,'2063','도서인쇄비','C',1,80,1,'인쇄비',0,NULL),
 (1,'2065','복리후생비','C',1,90,1,'복리 후생비',0,NULL),
 (1,'2064','행사비','C',1,100,1,NULL,0,NULL),
 (1,'2082','소모품비','C',1,110,1,'소모품',0,NULL),
 (1,'2068','잡비','C',1,120,1,'기타 잡비',0,'결산서 한 줄 = 이체수수료 + 잡비'),
 (1,'2090','방송지출','C',1,130,1,'실시간 방송 관련',0,NULL),
 (1,'2066','공회교회 지원·업무','C',1,140,1,'공회교회 지원, 업무',0,'결산서 한 줄 = 공회업무비 + 서인교회지원');

-- 하위 계정 (부모 code 로 연결)
INSERT INTO acc_accounts (unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail)
SELECT 1, v.code, v.name, 'C', p.id, 2, v.so, 1, v.rn, 0 FROM acc_accounts p JOIN (
  SELECT '2069' code,'전기세' name,1 so,NULL rn UNION ALL
  SELECT '2070','수도세',2,NULL UNION ALL
  SELECT '2072','통신비',3,'통신비(전화요금 등)' UNION ALL
  SELECT '2071','재산세',4,NULL UNION ALL
  SELECT '2089','기타세금',5,'기타(세금·과태료)'
) v WHERE p.unitId=1 AND p.code='2059';

INSERT INTO acc_accounts (unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail)
SELECT 1, v.code, v.name, 'C', p.id, 2, v.so, 1, v.rn, 0 FROM acc_accounts p JOIN (
  SELECT '2075' code,'차량보험료' name,1 so,'차량 보험' rn UNION ALL
  SELECT '2076','차량수리비',2,'차량 관리(수리 등)' UNION ALL
  SELECT '2077','차량유대',3,'차량 유대' UNION ALL
  SELECT '2078','자동차세',4,NULL UNION ALL
  SELECT '2079','교통비',5,'통행료(고속도로) 등' UNION ALL
  SELECT '2084','주차장이용료',6,'외부 주차장 이용료' UNION ALL
  SELECT '2087','기타차량관리비',7,'기타(차량, 주차장 관리)' UNION ALL
  SELECT '2056','주차장관리비',8,'주차장 관리'
) v WHERE p.unitId=1 AND p.code='2060';

INSERT INTO acc_accounts (unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail)
SELECT 1, v.code, v.name, 'C', p.id, 2, v.so, 1, NULL, 0 FROM acc_accounts p JOIN (
  SELECT '2081' code,'비품비' name,1 so UNION ALL SELECT '2092','별관비품',2
) v WHERE p.unitId=1 AND p.code='2058';

INSERT INTO acc_accounts (unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail)
SELECT 1, v.code, v.name, 'C', p.id, 2, v.so, 1, NULL, 0 FROM acc_accounts p JOIN (
  SELECT '2057' code,'집회지원비' name,1 so UNION ALL SELECT '2094','집회경비',2
) v WHERE p.unitId=1 AND p.code='2062';

INSERT INTO acc_accounts (unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail)
SELECT 1, v.code, v.name, 'C', p.id, 2, v.so, 1, NULL, 0 FROM acc_accounts p JOIN (
  SELECT '2085' code,'이체수수료' name,1 so UNION ALL SELECT '2086','잡비',2
) v WHERE p.unitId=1 AND p.code='2068';

INSERT INTO acc_accounts (unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail)
SELECT 1, v.code, v.name, 'C', p.id, 2, v.so, 1, NULL, 0 FROM acc_accounts p JOIN (
  SELECT '2091' code,'공회업무비' name,1 so UNION ALL SELECT '2093','서인교회지원',2
) v WHERE p.unitId=1 AND p.code='2066';

-- ── 2) 십일조회계(unit 2) — 2025 결산서 항목 기준 (입력 방식은 추후 협의) ──
UPDATE acc_accounts SET code='1003', name='십일조연보', level=1, sortOrder=10, reportName='십일조 연보' WHERE id=2;
INSERT INTO acc_accounts (unitId, code, name, type, level, sortOrder, isActive, reportName, reportDetail, description) VALUES
 (2,'1028','이자수입','D',1,20,1,'이자 수입',0,NULL),
 (2,'1008','목회자기초연보','D',1,30,1,'목회자 기초연보',0,NULL),
 (2,'1050','대여금입금','D',1,90,1,'대여금 입금',0,'비경상 — 외부 차입금 입금 (회계 간 대여는 [회계 간 대체] 사용)'),
 (2,'2001','교역자사례','C',1,10,1,'교역자 사례',0,NULL),
 (2,'2002','공회비','C',1,20,1,NULL,0,NULL),
 (2,'2003','연구소지원','C',1,30,1,'연구소 지원',0,NULL),
 (2,'2004','사택수술및치료비','C',1,40,1,'사택 수술 및 치료비',0,NULL),
 (2,'2005','4대보험부담금','C',1,50,1,'4대보험 부담금',0,NULL),
 (2,'2006','양성원지원','C',1,60,1,'양성원 지원',0,NULL),
 (2,'2007','타교회건축지원','C',1,70,1,'타교회 건축연보',0,NULL),
 (2,'2008','선교후원','C',1,80,1,NULL,0,NULL),
 (2,'2085','이체수수료','C',1,90,1,'수수료',0,NULL);

-- ── 3) 건축회계(unit 3) ──
UPDATE acc_accounts SET code='1001', level=1, sortOrder=10, reportName='월정연보' WHERE id=9;
INSERT INTO acc_accounts (unitId, code, name, type, level, sortOrder, isActive, reportName, reportDetail) VALUES
 (3,'1028','이자수입','D',1,20,1,NULL,0),
 (3,'2007','타교회건축지원','C',1,10,1,'타교회 건축연보',0),
 (3,'2085','이체수수료','C',1,20,1,'수수료',0);

-- ── 4) 주교회계(unit 4) ──
UPDATE acc_accounts SET code='1001', name='주일학교연보', level=1, sortOrder=10 WHERE id=10;
INSERT INTO acc_accounts (unitId, code, name, type, level, sortOrder, isActive, reportName, reportDetail) VALUES
 (4,'1028','이자수입','D',1,20,1,'이자',0),
 (4,'1035','기타수입','D',1,30,1,'기타',0),
 (4,'2001','주교시상','C',1,10,1,NULL,0),
 (4,'2002','펄기시상','C',1,20,1,NULL,0),
 (4,'2003','성탄선물','C',1,30,1,NULL,0),
 (4,'2004','암송시상','C',1,40,1,NULL,0),
 (4,'2086','기타지출','C',1,50,1,'기타',0);

-- ── 5) 전도회계(unit 5) ──
UPDATE acc_accounts SET code='1001', name='전도회비', level=1, sortOrder=10 WHERE id=11;
INSERT INTO acc_accounts (unitId, code, name, type, level, sortOrder, isActive, reportName, reportDetail) VALUES
 (5,'1028','이자수입','D',1,20,1,'이자',0),
 (5,'2001','경조사비','C',1,10,1,NULL,0),
 (5,'2002','불우이웃성금','C',1,20,1,'불우이웃 성금',0),
 (5,'2003','심방지원','C',1,30,1,'심방 지원',0),
 (5,'2086','기타지출','C',1,40,1,'기타',0);

-- ── 6) 통장 — 계좌번호는 추후 입력 (관리 화면) ──
INSERT INTO acc_funds (unitId, name, kind, isDefault, sortOrder, isActive) VALUES
 (1,'일반회계 보통예금','보통',1,1,1),
 (1,'일반회계 현금','현금',0,9,1),
 (2,'십일조 보통예금','보통',1,1,1),
 (2,'십일조 정기예금','정기',0,2,1),
 (2,'십일조 현금','현금',0,9,1),
 (3,'건축 보통예금','보통',1,1,1),
 (4,'주일학교 보통예금','보통',1,1,1),
 (5,'전도 보통예금','보통',1,1,1);

-- ── 7) 이월금은 SQL 로 넣지 않음 — '연도별 이월금' 화면에서 시작 연도(2026) 통장별로 직접 입력.
--     이후 연도는 [연마감] 시 통장별 기말잔액이 자동 이월된다.
--     참고(2025 결산서 잔액): 십일조 27,322,637 / 일반 19,999,073 / 건축 34,382,162 / 전도 9,436,326 / 주일학교 3,567,576
