-- ============================================================
-- 첨부파일 단일 → 다중 이관
-- Post.fileName1/fileName2 를 post_attachments 로 복사.
-- 파일 실물은 그대로 두고 DB 관계만 생성.
-- 구 컬럼(fileName1/2, origName1/2, download1/2) 은 당분간 유지 → 2주 안정화 후 DROP.
-- ============================================================

-- 사전 안전 점검
SELECT
  (SELECT COUNT(*) FROM posts WHERE fileName1 IS NOT NULL AND fileName1 <> '')  AS file1_rows,
  (SELECT COUNT(*) FROM posts WHERE fileName2 IS NOT NULL AND fileName2 <> '')  AS file2_rows,
  (SELECT COUNT(*) FROM post_attachments)                                        AS existing_attachments;

-- file1 → sortOrder=0
INSERT INTO post_attachments (postId, fileName, origName, sortOrder, downloadCount, createdAt)
SELECT
  id AS postId,
  fileName1,
  COALESCE(NULLIF(origName1, ''), fileName1) AS origName,
  0 AS sortOrder,
  COALESCE(download1, 0) AS downloadCount,
  COALESCE(createdAt, NOW()) AS createdAt
FROM posts
WHERE fileName1 IS NOT NULL AND fileName1 <> '';

-- file2 → sortOrder=1
INSERT INTO post_attachments (postId, fileName, origName, sortOrder, downloadCount, createdAt)
SELECT
  id AS postId,
  fileName2,
  COALESCE(NULLIF(origName2, ''), fileName2) AS origName,
  1 AS sortOrder,
  COALESCE(download2, 0) AS downloadCount,
  COALESCE(createdAt, NOW()) AS createdAt
FROM posts
WHERE fileName2 IS NOT NULL AND fileName2 <> '';

-- 검증
SELECT
  (SELECT COUNT(*) FROM posts WHERE fileName1 IS NOT NULL AND fileName1 <> '')
  + (SELECT COUNT(*) FROM posts WHERE fileName2 IS NOT NULL AND fileName2 <> '') AS expected,
  (SELECT COUNT(*) FROM post_attachments)                                        AS actual;

-- 샘플
SELECT p.id, p.subject, a.id AS attId, a.sortOrder, a.origName, a.downloadCount
FROM posts p
JOIN post_attachments a ON a.postId = p.id
ORDER BY p.id DESC LIMIT 10;
