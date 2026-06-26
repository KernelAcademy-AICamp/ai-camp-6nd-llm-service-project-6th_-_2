-- ============================================================================
-- 반띵 — 회원 경고 누적 카운트
-- Version: 1.0.0
-- ============================================================================
--
-- 설계: 신고/분쟁 처리(/admin/reports)에서 피신고자에게 "경고"를 줄 때 누적.
--   · warning_count : 운영자가 부여한 경고 횟수. 당사자 카드 5지표(거래/좋아요/
--                     싫어요/경고/신고) 중 "경고" 소스. 정지(suspended_at) 전 단계.
--   집계/자동 정지 임계치는 이번 범위 밖(추후 trigger로 확장 가능).
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.warning_count IS '운영자 경고 누적 횟수. /admin/reports 경고 처리로 증가.';

NOTIFY pgrst, 'reload schema';
