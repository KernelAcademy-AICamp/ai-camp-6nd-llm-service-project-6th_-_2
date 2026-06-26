-- ============================================================================
-- 반띵 — 사용자 성향 태깅 (행동 로그 → SQL 집계 → 태그)
-- Version: 1.0.0
-- ============================================================================
--
-- 설계: docs/user-propensity-tagging.md
--   user_events(통합 행동 로그) → pg_cron 1시간 refresh_user_tags() → user_tags
--   임계값은 tag_rules 테이블(운영자가 코드 수정 없이 조정).
--   ML 없음, SQL만. 봇 제외는 이번 범위 밖(전체 사용자 대상).
--
-- 정책:
--   · 찜·공구도 클릭 시점에 user_events 로 "통합 적재"(단일 행동 로그).
--     store_favorites / group_buy_participants 는 도메인 상태로 그대로 유지.
--   · user_events.section 이 곧 카테고리(food/living/...) → 별도 category 컬럼 없음.
--   · 집계는 v_user_actions(=user_events 별칭 뷰) 30일치를 읽는다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. user_events 확장 — kind 에 favorite/groupbuy 추가, price 컬럼
-- ----------------------------------------------------------------------------
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_kind_check;
ALTER TABLE user_events ADD CONSTRAINT user_events_kind_check
    CHECK (kind IN ('search', 'click', 'favorite', 'groupbuy'));

ALTER TABLE user_events ADD COLUMN IF NOT EXISTS price integer;  -- 카드 가격(원), 없으면 null

COMMENT ON COLUMN user_events.price IS '클릭/찜한 카드 가격(원). 가성비 태그용. 없으면 null.';

-- ----------------------------------------------------------------------------
-- 2. v_user_actions — 집계 입력의 단일 원천 (목업 논리 스키마 별칭)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_actions AS
    SELECT
        user_id,
        kind     AS action_type,   -- 'search' | 'click' | 'favorite' | 'groupbuy'
        keyword  AS target,        -- 검색어 / 카드 title / 공구 slug
        section  AS category,      -- FeedSection (food/living/...) 또는 null
        price,
        created_at
    FROM user_events;

COMMENT ON VIEW v_user_actions IS '성향 태그 집계 입력. user_events 를 목업 논리 스키마로 노출.';

-- ----------------------------------------------------------------------------
-- 3. user_tags — 집계 결과 (사용자 1명 × 태그 N개)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_tags (
    user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tag         text        NOT NULL,           -- 코드 키 (예: 'food_focused')
    confidence  numeric     NOT NULL,           -- 0~1 (화면의 0.78)
    evidence    text        NOT NULL,           -- "전체 활동 중 식품 78%"
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags(tag);

COMMENT ON TABLE user_tags IS 'refresh_user_tags() 가 1시간마다 전체 재삽입. 추천 가점 + 운영 분석.';

ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;
-- 본인 태그만 SELECT (운영 화면은 service_role 로 RLS 우회).
DROP POLICY IF EXISTS "user_tags_select_own" ON user_tags;
CREATE POLICY "user_tags_select_own"
    ON user_tags FOR SELECT
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. tag_rules — 임계값(운영자가 코드 수정 없이 조정)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tag_rules (
    tag        text PRIMARY KEY,                 -- 'food_focused'
    label      text    NOT NULL,                 -- '식품 위주'
    threshold  numeric NOT NULL,                 -- 비율 태그=비율 / 백분위 태그=백분위 컷
    params     jsonb   NOT NULL DEFAULT '{}',
    enabled    boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE tag_rules IS '성향 태그 임계값. refresh_user_tags() 가 읽어 적용. 운영자 조정용.';

-- 초기 6종 (docs/user-propensity-tagging.md §8)
INSERT INTO tag_rules (tag, label, threshold) VALUES
    ('food_focused',       '식품 위주',    0.70),  -- 식품 카테고리 비율 ≥ 70%
    ('value_seeker',       '가성비 추구',  0.30),  -- 평균 클릭 가격 하위 30% 백분위
    ('active_participant', '적극 참여자',  0.85),  -- 공구 참여 수 상위 15% (백분위 ≥ 0.85)
    ('evening_user',       '저녁 사용자',  0.60),  -- 19~23시 활동 비율 ≥ 60%
    ('costco_lover',       '코스트코 선호', 0.10),  -- 코스트코 관련 활동 비율 ≥ 10%
    ('weekend_user',       '주말 사용자',  0.50)   -- 주말 활동 비율 ≥ 50%
ON CONFLICT (tag) DO NOTHING;

ALTER TABLE tag_rules ENABLE ROW LEVEL SECURITY;  -- 정책 없음 → service_role 만 접근

-- ----------------------------------------------------------------------------
-- 5. refresh_user_tags() — 30일 행동 집계 → 임계 적용 → user_tags 전체 재삽입
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_user_tags() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 전체 재삽입(결정 Q2): 임계 미달로 빠진 태그가 자동 정리된다.
    -- WHERE true: PostgREST(service_role) 연결의 sql_safe_updates 가드 통과용
    --   (WHERE 없는 DELETE 는 "DELETE requires a WHERE clause" 로 거부됨).
    DELETE FROM user_tags WHERE true;

    -- 사용자별 최근 30일 행동 통계 (KST 기준 시간대 판정)
    DROP TABLE IF EXISTS _ut_stats;
    CREATE TEMP TABLE _ut_stats AS
    SELECT
        user_id,
        count(*)::numeric AS total,
        count(*) FILTER (WHERE action_type = 'groupbuy')                                       AS gb_cnt,
        count(*) FILTER (WHERE category = 'food')                                              AS food_cnt,
        count(*) FILTER (WHERE extract(hour FROM created_at AT TIME ZONE 'Asia/Seoul')
                               BETWEEN 19 AND 23)                                              AS evening_cnt,
        count(*) FILTER (WHERE extract(isodow FROM created_at AT TIME ZONE 'Asia/Seoul') >= 6) AS weekend_cnt,
        count(*) FILTER (WHERE target ILIKE '%코스트코%' OR target ILIKE '%costco%')           AS costco_cnt,
        avg(price)  FILTER (WHERE price IS NOT NULL)                                           AS avg_price,
        count(*)    FILTER (WHERE price IS NOT NULL)                                           AS priced_cnt
    FROM v_user_actions
    WHERE created_at >= now() - interval '30 days'
    GROUP BY user_id;

    -- (a) 식품 위주 — 비율 태그
    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'food_focused',
           round(s.food_cnt / s.total, 2),
           '전체 활동 중 식품 ' || round(100 * s.food_cnt / s.total) || '%'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'food_focused' AND r.enabled
      AND s.total > 0 AND (s.food_cnt / s.total) >= r.threshold;

    -- (b) 저녁 사용자 — 비율 태그
    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'evening_user',
           round(s.evening_cnt / s.total, 2),
           '활동의 ' || round(100 * s.evening_cnt / s.total) || '%가 19~23시 사이'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'evening_user' AND r.enabled
      AND s.total > 0 AND (s.evening_cnt / s.total) >= r.threshold;

    -- (c) 주말 사용자 — 비율 태그
    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'weekend_user',
           round(s.weekend_cnt / s.total, 2),
           '활동의 ' || round(100 * s.weekend_cnt / s.total) || '%가 주말'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'weekend_user' AND r.enabled
      AND s.total > 0 AND (s.weekend_cnt / s.total) >= r.threshold;

    -- (d) 코스트코 선호 — 비율 태그
    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'costco_lover',
           round(s.costco_cnt / s.total, 2),
           '코스트코 관련 활동 ' || s.costco_cnt || '회'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'costco_lover' AND r.enabled
      AND s.total > 0 AND (s.costco_cnt / s.total) >= r.threshold;

    -- (e) 적극 참여자 — 공구 참여 수 백분위 상위 (≥ threshold)
    --     percent_rank() 는 double precision → round(.., 2) 위해 numeric 캐스트.
    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT q.user_id, 'active_participant',
           round(q.pr::numeric, 2),
           '한 달 공구 ' || q.gb_cnt || '회 · 상위 ' || round(100 * (1 - q.pr))::text || '%'
    FROM (
        SELECT user_id, gb_cnt, percent_rank() OVER (ORDER BY gb_cnt) AS pr
        FROM _ut_stats WHERE gb_cnt > 0
    ) q, tag_rules r
    WHERE r.tag = 'active_participant' AND r.enabled AND q.pr >= r.threshold;

    -- (f) 가성비 추구 — 평균 클릭 가격 백분위 하위 (≤ threshold)
    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT q.user_id, 'value_seeker',
           round((1 - q.pr)::numeric, 2),
           '평균 클릭 가격 ' || round(q.avg_price)::text || '원 · 하위 ' || round(100 * q.pr)::text || '%'
    FROM (
        SELECT user_id, avg_price, percent_rank() OVER (ORDER BY avg_price) AS pr
        FROM _ut_stats WHERE priced_cnt > 0 AND avg_price IS NOT NULL
    ) q, tag_rules r
    WHERE r.tag = 'value_seeker' AND r.enabled AND q.pr <= r.threshold;

    DROP TABLE IF EXISTS _ut_stats;
END $$;

COMMENT ON FUNCTION refresh_user_tags IS '30일 행동 집계 → tag_rules 임계 적용 → user_tags 전체 재삽입.';

-- ----------------------------------------------------------------------------
-- 6. pg_cron — 매시 정각 집계 (search_cache_cron 과 동일 패턴, 단 DB 내부 함수 직접 호출)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    PERFORM cron.unschedule('refresh-user-tags');
EXCEPTION WHEN OTHERS THEN
    NULL;  -- 잡이 없으면 무시
END $$;

SELECT cron.schedule('refresh-user-tags', '0 * * * *', $$ SELECT refresh_user_tags(); $$);

-- 최초 1회 즉시 집계(배포 직후 화면이 비지 않도록)
SELECT refresh_user_tags();

-- 확인용:
--   SELECT * FROM user_tags ORDER BY confidence DESC LIMIT 20;
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'refresh-user-tags';

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
