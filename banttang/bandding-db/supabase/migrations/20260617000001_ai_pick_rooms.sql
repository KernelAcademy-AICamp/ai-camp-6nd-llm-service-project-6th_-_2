-- ============================================================================
-- 반띵 — AI 추천 방 (시스템 호스트가 미리 만들어 둔 0/2 빈 방)
-- Version: 1.2.0
-- Description: 홈 "오늘은 이런 상품 어때요?" 섹션에 노출할, 시스템 호스트가
--              미리 생성해 둔 모집중(0/2) 방. 일반 모집 목록(메인 피드)에는
--              나오지 않도록 is_ai_pick 플래그로 구분한다.
--              상품 데이터는 큐레이션 고정이며, 시드는 서비스 롤 API로 채운다.
-- ============================================================================

ALTER TABLE parties
    ADD COLUMN IF NOT EXISTS is_ai_pick boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pick_group text,            -- wellbeing / fruit / egg
    ADD COLUMN IF NOT EXISTS external_image_url text;     -- 큐레이션 썸네일(데이터 URI/외부 URL)

COMMENT ON COLUMN parties.is_ai_pick IS 'true면 AI 추천 방(시스템 호스트). 메인 피드에선 제외, 추천 섹션에만 노출';
COMMENT ON COLUMN parties.pick_group IS 'AI 추천 방 소분류: wellbeing/fruit/egg';
COMMENT ON COLUMN parties.external_image_url IS 'AI 추천 방 썸네일 (party_photos 대신 큐레이션 이미지 직접 보관)';

-- 추천 방만 빠르게 조회 (부분 인덱스)
CREATE INDEX IF NOT EXISTS idx_parties_ai_pick
    ON parties (created_at)
    WHERE is_ai_pick;

-- 홈 피드 뷰 재생성 — p.* 가 새 컬럼(is_ai_pick/pick_group/external_image_url)을 포함하도록.
-- CREATE OR REPLACE는 기존 컬럼 순서를 못 바꾸므로(새 컬럼이 p.* 중간에 끼어듦) DROP 후 재생성한다.
DROP VIEW IF EXISTS v_parties_with_stats;
CREATE VIEW v_parties_with_stats AS
SELECT
    p.*,
    h.nickname              AS host_nickname,
    h.level                 AS host_level,
    h.transaction_count     AS host_transaction_count,
    (SELECT count(*) FROM party_participants pp
        WHERE pp.party_id = p.id AND pp.status = 'approved') AS approved_count,
    (p.max_participants -
        (SELECT count(*) FROM party_participants pp
            WHERE pp.party_id = p.id AND pp.status = 'approved')) AS slots_left,
    (SELECT array_agg(storage_path ORDER BY order_index)
        FROM party_photos WHERE party_id = p.id) AS photo_paths
FROM parties p
JOIN profiles h ON h.id = p.host_id;

NOTIFY pgrst, 'reload schema';
