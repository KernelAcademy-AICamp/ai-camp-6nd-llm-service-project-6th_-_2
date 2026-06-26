-- ============================================================================
-- 반띵 — 사용자 관리(운영자) 컬럼
-- Version: 1.0.0
-- ============================================================================
--
-- 설계: docs/admin-user-management.md
--   회원 목록/상세에서 봇 표시·필터, 제재(정지) 관리에 필요한 컬럼.
--   · is_bot         : 봇 표시·필터·"봇으로 표시" 액션 (집계 제외는 이번 범위 밖)
--   · suspended_at   : null=정상, 값=제재(정지). 사유는 suspended_reason.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_bot           boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at     timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason text;

COMMENT ON COLUMN profiles.is_bot IS '시뮬레이션/데모 봇 표시. 운영 목록 필터·배지용.';
COMMENT ON COLUMN profiles.suspended_at IS '제재(정지) 시각. null이면 정상.';

-- 운영 목록 기본 정렬(최근 활동순) 인덱스.
CREATE INDEX IF NOT EXISTS idx_profiles_admin_list ON profiles(last_active_at DESC);

NOTIFY pgrst, 'reload schema';
