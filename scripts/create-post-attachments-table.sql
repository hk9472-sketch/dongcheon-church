-- ============================================================
-- post_attachments 테이블 생성
-- Prisma schema (PostAttachment 모델) 와 동일한 구조.
-- prisma db push 대신 수동 생성할 때 사용.
--
-- 실행 순서:
--   1) (이 파일) create-post-attachments-table.sql  ← 테이블 생성
--   2) migrate-attachments.sql                       ← 기존 file1/file2 데이터 이관
-- ============================================================

CREATE TABLE IF NOT EXISTS `post_attachments` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `postId`         INT          NOT NULL,
  `fileName`       VARCHAR(255) NOT NULL,
  `origName`       VARCHAR(255) NOT NULL,
  `sortOrder`      INT          NOT NULL DEFAULT 0,
  `downloadCount`  INT          NOT NULL DEFAULT 0,
  `size`           INT          NULL,
  `mimeType`       VARCHAR(100) NULL,
  `width`          INT          NULL,
  `height`         INT          NULL,
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `post_attachments_postId_sortOrder_idx` (`postId`, `sortOrder`),
  CONSTRAINT `post_attachments_postId_fkey`
    FOREIGN KEY (`postId`) REFERENCES `posts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 검증
SELECT
  TABLE_NAME, ENGINE, TABLE_COLLATION,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_attachments') AS column_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_attachments';
