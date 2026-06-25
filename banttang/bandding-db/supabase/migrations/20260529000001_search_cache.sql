-- ============================================================================
-- 동네별 검색 캐시 (추천 서비스 B단계)
-- ============================================================================
-- 다이어그램의 "동네별 캐시 (Supabase, 1시간)" 박스.
-- 목적: 같은 동네는 1시간에 네이버 검색 1번만 → 호출 수를 사용자 수가 아니라
--       동네 수에 비례시킨다. 동네 100명 = 1시간에 검색 1회.
--
-- 키 설계: neighborhood_id 단일 PK.
--   현재 추천은 "모든 사용자가 모든 관심사를 선택했다"고 가정하므로 피드가
--   동네마다 동일 → 동네당 1 row 면 충분. (관심사를 사용자별로 받게 되면
--   캐시 키에 관심사 해시를 추가하는 RFC 필요.)
-- ============================================================================

CREATE TABLE search_cache (
    neighborhood_id uuid PRIMARY KEY REFERENCES neighborhoods(id) ON DELETE CASCADE,
    -- 정제(중복 제거·가중치 정렬)까지 끝난 추천 피드. 섹션별 결과를 통째로 보관.
    feed            jsonb       NOT NULL,
    -- 이번 갱신에 쓴 네이버 호출 수 (관측·한도 관리용)
    query_count     int         NOT NULL DEFAULT 0,
    fetched_at      timestamptz NOT NULL DEFAULT now(),
    -- fetched_at + TTL(1시간). 스케줄러(D단계)가 만료 row 를 골라 갱신.
    expires_at      timestamptz NOT NULL
);

COMMENT ON TABLE  search_cache IS '동네별 네이버 검색 결과 캐시. TTL 1시간, 사용자끼리 공유.';
COMMENT ON COLUMN search_cache.feed IS '정제 완료된 추천 피드(JSONB). 섹션별 정렬·중복제거 끝난 상태.';
COMMENT ON COLUMN search_cache.expires_at IS 'fetched_at + 1시간. 만료 시 다음 요청 또는 cron 이 갱신.';

-- cron(D단계)이 만료된 동네만 빠르게 스캔하도록 인덱스.
CREATE INDEX idx_search_cache_expires_at ON search_cache (expires_at);

-- ----------------------------------------------------------------------------
-- RLS — 검색 결과는 민감 정보가 아니므로 neighborhoods 와 동일하게 공개 SELECT.
--       쓰기는 service_role(서버 갱신)만 — 정책 미부여로 anon/authenticated 차단.
-- ----------------------------------------------------------------------------
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_cache_select_all"
    ON search_cache FOR SELECT
    USING (true);
