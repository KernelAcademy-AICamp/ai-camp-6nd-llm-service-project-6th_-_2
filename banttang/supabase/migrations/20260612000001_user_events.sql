-- ============================================================================
-- 반띵 — 사용자 행동 이벤트 (검색·클릭) 로그
-- Version: 1.0.0
-- ============================================================================
--
-- 추천 피드 개인화 랭킹의 "신호 5(검색·클릭 이력)" 소스.
--   kind = 'search' (검색어 제출)  |  'click' (스토어 카드 클릭)
--   keyword = 검색어 또는 클릭한 카드 title
--   section = 알 수 있으면 FeedSection 값(예: 'food'), 없으면 null
--
-- 점수화는 lib/naver/signals.ts 가 최근 90일치를 키워드별로 집계해
--   weight = min(0.5 × 횟수, 3) 으로 환산하고 신선도 감쇠를 곱한다.
--
-- store_favorites 패턴과 동일: RLS 본인 행, storage 구문 없음(SQL Editor 직접 적용).
-- 앱은 admin(service_role) 클라이언트로 insert 하지만 RLS는 2차 방어선.
-- 부정 신호(-2)는 추후 kind='impression' 을 더해 확장 가능(이번 범위 밖).
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_events (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('search', 'click')),
    keyword     text NOT NULL,
    section     text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- 신호 집계는 항상 "이 유저의 최근 이벤트" → (user_id, created_at desc) 인덱스.
CREATE INDEX IF NOT EXISTS idx_user_events_user_recent
    ON user_events(user_id, created_at DESC);

COMMENT ON TABLE user_events IS '추천 개인화용 사용자 행동 로그(검색·클릭). 최근 90일 집계.';

ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_events_select_own" ON user_events;
CREATE POLICY "user_events_select_own"
    ON user_events FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_events_insert_own" ON user_events;
CREATE POLICY "user_events_insert_own"
    ON user_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
