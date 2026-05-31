-- 영수증 사진 재사용 방지 — image_sha256 컬럼 + partial unique index
--
-- 정책: 같은 사진 파일을 다른 파티(혹은 같은 파티)에서 다시 인증에 못 쓰게 한다.
-- 1차 방어선 — sha256은 동일 파일 재업로드만 막음. 크롭/리사이즈/재인코딩으로 우회 가능.
-- 보다 강한 dedup(주문번호/승인번호 기반)은 별도 receipt_redemptions 시스템에서 처리.
--
-- nullable로 두는 이유:
--   - 마이그레이션 이전 기존 row 호환
--   - 외부 URL(시드 데이터 등) 처리 시 hash 없이 INSERT 허용
-- WHERE 절 partial unique로 NULL 다중 허용.

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS image_sha256 text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_receipts_image_sha256
    ON receipts(image_sha256)
    WHERE image_sha256 IS NOT NULL;

COMMENT ON COLUMN receipts.image_sha256
    IS '업로드된 영수증 이미지의 sha256 hex. 동일 파일 재업로드 차단용.';
