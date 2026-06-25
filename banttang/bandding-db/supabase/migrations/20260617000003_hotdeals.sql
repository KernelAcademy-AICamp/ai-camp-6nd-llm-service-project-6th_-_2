-- ============================================================================
-- 반띵 — 핫딜 애그리게이터 (커뮤니티 RSS 수집)
-- Version: 1.0.0
-- ============================================================================
--
-- 설계: docs/hotdeal-aggregator.md
--   pg_cron(매시) → pg_net → /api/internal/refresh-hotdeals
--     → RSS 소스 GET·파싱·dedup → hotdeals upsert. 스토어 핫딜 탭이 read.
--   리스크 최소화: 공식 RSS만, 원문 링크백(detail_url), 제목·메타만 저장(본문 미저장).
--   upsert 키: (source_id, source_article_id).
-- ============================================================================

CREATE TABLE IF NOT EXISTS hotdeals (
    id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id          text NOT NULL,            -- 'coolenjoy' | 'ruliweb' | ...
    source_article_id  text NOT NULL,
    title              text NOT NULL,
    category           text,
    price              integer,                  -- HTML 소스 확장 시 채움
    shipping           text,
    author             text,
    votes              integer NOT NULL DEFAULT 0,
    comments           integer NOT NULL DEFAULT 0,
    is_ended           boolean NOT NULL DEFAULT false,
    thumbnail          text,
    detail_url         text NOT NULL,
    posted_at          timestamptz,
    crawled_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id, source_article_id)
);

CREATE INDEX IF NOT EXISTS idx_hotdeals_recent ON hotdeals(is_ended, posted_at DESC);

COMMENT ON TABLE hotdeals IS '커뮤니티 RSS 핫딜 수집. 원문 링크백(detail_url), 제목·메타만 저장.';

ALTER TABLE hotdeals ENABLE ROW LEVEL SECURITY;
-- 공개 read(미종료). 앱은 service_role 로 읽지만 2차 방어선.
DROP POLICY IF EXISTS "hotdeals_select_active" ON hotdeals;
CREATE POLICY "hotdeals_select_active"
    ON hotdeals FOR SELECT
    USING (is_ended = false);

-- ----------------------------------------------------------------------------
-- pg_cron — 매시 5분, 내부 라우트 호출 (refresh-feeds 패턴, Vault 시크릿 재사용)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('refresh-hotdeals');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'refresh-hotdeals',
    '5 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'recommend_app_url')
               || '/api/internal/refresh-hotdeals',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' ||
                (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'recommend_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
    $$
);

NOTIFY pgrst, 'reload schema';
