-- ============================================================================
-- 반띵 — 거주지(건물) 정보 + 커뮤니티 거주지 탭
-- Version: 1.0.0
-- ============================================================================
--
-- 동네(neighborhood)보다 작은 "거주지(건물)" 단위를 도입한다. 예: "A고시원", "해피빌라".
--   - profiles.residence        : 사용자가 프로필에서 입력하는 건물명 (nullable)
--   - community_posts.residence : 글 작성 시 작성자 거주지를 스냅샷 → "거주지 탭" 필터용
--                                 (작성 시점 기준. 이후 이사해도 옛 글은 그대로 둠)
--
-- storage 구문 없음 → SQL Editor에서 바로 적용.
-- ============================================================================

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS residence text;

ALTER TABLE community_posts
    ADD COLUMN IF NOT EXISTS residence text;

COMMENT ON COLUMN profiles.residence IS '거주지(건물명). 커뮤니티 거주지 탭 필터 기준.';
COMMENT ON COLUMN community_posts.residence IS '작성자 거주지 스냅샷. 같은 건물 글 필터용.';

-- 거주지 탭 조회 인덱스 (동네 + 거주지)
CREATE INDEX IF NOT EXISTS idx_community_posts_residence
    ON community_posts(neighborhood_id, residence);

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
