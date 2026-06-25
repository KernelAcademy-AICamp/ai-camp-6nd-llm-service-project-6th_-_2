-- ============================================================================
-- 추천 캐시 자동 갱신 cron (추천 서비스 D단계)
-- ============================================================================
-- 다이어그램의 "스케줄러 (Supabase Cron / pg_cron)" 박스.
-- 매시 정각 → pg_net 으로 우리 앱의 내부 갱신 엔드포인트를 호출 →
--   /api/internal/refresh-feeds 가 is_active 동네 전부 refreshNeighborhoodFeed.
-- 이렇게 미리 갱신해 두면 사용자 요청은 항상 캐시 적중(네이버 호출 0)이 된다.
--
-- ⚠ 앱 URL·시크릿은 환경별 값이라 마이그레이션에 하드코딩하지 않는다.
--   Supabase Vault 에 보관하고 cron 이 이름으로 참조한다. 아래 [사전 준비] 참고.
-- ⚠ pg_net 이 우리 앱(Vercel 등)으로 나가야 하므로 배포 후에만 동작.
--   로컬 localhost 는 원격 Supabase 에서 닿지 않는다.
-- ============================================================================

-- 확장 활성화 (Supabase 에 사전 설치돼 있음)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- [사전 준비] 아래 두 줄을 실제 값으로 한 번만 실행 (Vault 시크릿 등록).
--   값이 노출되면 안 되므로 마이그레이션에는 placeholder 만 둔다 — 직접 실행할 것.
--
--   select vault.create_secret('https://<배포-앱-도메인>', 'recommend_app_url');
--   select vault.create_secret('<.env 의 CRON_SECRET 과 동일 값>', 'recommend_cron_secret');
--
--   이미 등록돼 있으면 갱신:
--   select vault.update_secret(
--     (select id from vault.secrets where name='recommend_app_url'),
--     'https://<새-도메인>');
-- ----------------------------------------------------------------------------

-- 재실행 안전: 기존 잡이 있으면 제거 후 재등록
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-recommendation-feeds');
EXCEPTION WHEN OTHERS THEN
  NULL; -- 잡이 없으면 무시
END $$;

-- 매시 정각 갱신
SELECT cron.schedule(
  'refresh-recommendation-feeds',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'recommend_app_url')
           || '/api/internal/refresh-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'recommend_cron_secret')
    ),
    body := '{}'::jsonb,
    -- 동네 × 네이버 호출이라 응답이 느릴 수 있어 넉넉히 (pg_net 은 백그라운드 처리)
    timeout_milliseconds := 120000
  );
  $$
);

-- 확인용:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'refresh-recommendation-feeds';
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
--   SELECT status, status_code FROM net._http_response ORDER BY created DESC LIMIT 5;
