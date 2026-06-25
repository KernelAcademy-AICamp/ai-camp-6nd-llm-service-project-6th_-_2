-- ============================================================================
-- 반띵 — 성향 집계에 모집글(parties) 포함
-- Version: 1.0.0
-- ============================================================================
--
-- 배경: 성향 태깅은 v_user_actions(=user_events)만 집계해, "내가 만든/참여한 모집글"
--   (party_participants)이 빠져 있었다. 모집글은 행동 의지가 분명한 신호라 포함한다.
--   · 모집글은 user_events 로 통합 적재되지 않으므로(중복 없음) v_user_actions 에 UNION.
--   · active_participant 태그가 공구(groupbuy) + 모집글(party) 둘 다 세도록 함수도 갱신.
--   docs/user-propensity-tagging.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. v_user_actions — user_events + 모집글(party_participants ⋈ parties)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_actions AS
    SELECT
        user_id,
        kind     AS action_type,   -- 'search' | 'click' | 'favorite' | 'groupbuy'
        keyword  AS target,
        section  AS category,
        price,
        created_at
    FROM user_events
    UNION ALL
    SELECT
        pp.user_id,
        'party'::text AS action_type,
        p.store_name  AS target,
        -- enum(party_category) 을 text 로 캐스트 후 매핑(없는 라벨 비교 에러 방지).
        CASE p.category::text
            WHEN 'delivery' THEN 'delivery'
            ELSE 'food'  -- offline_shopping / online_shopping → 식품
        END           AS category,
        p.price_per_person AS price,
        pp.applied_at AS created_at
    FROM party_participants pp
    JOIN parties p ON p.id = pp.party_id;

COMMENT ON VIEW v_user_actions IS '성향 태그 집계 입력. user_events + 모집글(party_participants⋈parties).';

-- ----------------------------------------------------------------------------
-- 2. refresh_user_tags — active_participant 가 공구+모집글 합산을 세도록 갱신
--    (그 외 태그 로직은 20260616000002 와 동일)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_user_tags() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM user_tags WHERE true;

    DROP TABLE IF EXISTS _ut_stats;
    CREATE TEMP TABLE _ut_stats AS
    SELECT
        user_id,
        count(*)::numeric AS total,
        -- 참여 = 플랫폼 공구 + 모집글(내가 만든/참여한)
        count(*) FILTER (WHERE action_type IN ('groupbuy', 'party'))                           AS gb_cnt,
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

    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'food_focused', round(s.food_cnt / s.total, 2),
           '전체 활동 중 식품 ' || round(100 * s.food_cnt / s.total) || '%'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'food_focused' AND r.enabled AND s.total > 0 AND (s.food_cnt / s.total) >= r.threshold;

    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'evening_user', round(s.evening_cnt / s.total, 2),
           '활동의 ' || round(100 * s.evening_cnt / s.total) || '%가 19~23시 사이'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'evening_user' AND r.enabled AND s.total > 0 AND (s.evening_cnt / s.total) >= r.threshold;

    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'weekend_user', round(s.weekend_cnt / s.total, 2),
           '활동의 ' || round(100 * s.weekend_cnt / s.total) || '%가 주말'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'weekend_user' AND r.enabled AND s.total > 0 AND (s.weekend_cnt / s.total) >= r.threshold;

    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT s.user_id, 'costco_lover', round(s.costco_cnt / s.total, 2),
           '코스트코 관련 활동 ' || s.costco_cnt || '회'
    FROM _ut_stats s, tag_rules r
    WHERE r.tag = 'costco_lover' AND r.enabled AND s.total > 0 AND (s.costco_cnt / s.total) >= r.threshold;

    -- 적극 참여자 — 공구+모집글 참여 수 백분위 상위
    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT q.user_id, 'active_participant', round(q.pr::numeric, 2),
           '한 달 공구·모집글 ' || q.gb_cnt || '회 · 상위 ' || round(100 * (1 - q.pr))::text || '%'
    FROM (
        SELECT user_id, gb_cnt, percent_rank() OVER (ORDER BY gb_cnt) AS pr
        FROM _ut_stats WHERE gb_cnt > 0
    ) q, tag_rules r
    WHERE r.tag = 'active_participant' AND r.enabled AND q.pr >= r.threshold;

    INSERT INTO user_tags (user_id, tag, confidence, evidence)
    SELECT q.user_id, 'value_seeker', round((1 - q.pr)::numeric, 2),
           '평균 클릭 가격 ' || round(q.avg_price)::text || '원 · 하위 ' || round(100 * q.pr)::text || '%'
    FROM (
        SELECT user_id, avg_price, percent_rank() OVER (ORDER BY avg_price) AS pr
        FROM _ut_stats WHERE priced_cnt > 0 AND avg_price IS NOT NULL
    ) q, tag_rules r
    WHERE r.tag = 'value_seeker' AND r.enabled AND q.pr <= r.threshold;

    DROP TABLE IF EXISTS _ut_stats;
END $$;

-- 즉시 1회 반영
SELECT refresh_user_tags();

NOTIFY pgrst, 'reload schema';
