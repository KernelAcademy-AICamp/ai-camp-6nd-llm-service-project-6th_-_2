-- ============================================================================
-- 반띵 — AI 추천 캐시 (RAG: 성향 → 후보 retrieval → LLM 재정렬·이유)
-- Version: 1.0.0
-- ============================================================================
--
-- 설계: docs/ai-recommendation-rag.md
--   cron(매시) → /api/internal/refresh-recommendations (활성 사용자만)
--     → 후보 어셈블리(공구+네이버) + Claude 재정렬·이유 → user_recommendations upsert.
--   읽기는 즉시(캐시 적중). recs 없음/만료 → 기존 점수 정렬 폴백.
--
-- items 형태: [{ "ref": "groupbuy:sinbi-peach", "type": "groupbuy", "reason": "..." }]
--   ref 는 (type:식별자) — groupbuy:<slug> / party:<id> / naver:<link>.
--   rank 는 배열 순서. 읽는 시점에 ref 를 실제 후보로 재검증(만료 공구 숨김).
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_recommendations (
    user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    neighborhood_id uuid        REFERENCES neighborhoods(id),
    items           jsonb       NOT NULL DEFAULT '[]'::jsonb,
    model           text        NOT NULL,
    generated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id)
);

COMMENT ON TABLE user_recommendations IS 'AI 추천 캐시(배치 생성). 추천 탭이 우선 사용, 없으면 점수 정렬 폴백.';
COMMENT ON COLUMN user_recommendations.items IS '[{ref,type,reason}] 순서=rank. ref는 groupbuy:<slug>/party:<id>/naver:<link>.';

ALTER TABLE user_recommendations ENABLE ROW LEVEL SECURITY;
-- 본인 추천만 SELECT (배치/운영은 service_role 로 RLS 우회).
DROP POLICY IF EXISTS "user_recommendations_select_own" ON user_recommendations;
CREATE POLICY "user_recommendations_select_own"
    ON user_recommendations FOR SELECT
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- pg_cron — 매시 정각, 내부 라우트 호출 (LLM 호출은 앱에서. search_cache_cron 패턴)
--   Vault 시크릿 recommend_app_url / recommend_cron_secret 재사용(이미 등록됨).
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('refresh-user-recommendations');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 피드 캐시(refresh-feeds, 매시 0분)가 먼저 돌도록 10분 뒤에 추천 생성.
SELECT cron.schedule(
    'refresh-user-recommendations',
    '10 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'recommend_app_url')
               || '/api/internal/refresh-recommendations',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' ||
                (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'recommend_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
    );
    $$
);

NOTIFY pgrst, 'reload schema';
