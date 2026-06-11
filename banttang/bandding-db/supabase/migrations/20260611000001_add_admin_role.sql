-- 슈퍼 계정(관리자) 권한
-- ----------------------------------------------------------------------------
-- 모든 모집글·채팅을 열람할 수 있는 운영자 플래그.
-- 앱의 데이터 경로는 전부 service role(RLS 우회) + 라우트 핸들러 인가라서,
-- 권한 게이팅은 애플리케이션 레이어(requireAdmin)에서 이 컬럼을 읽어 수행한다.
-- (RLS 정책은 service client에는 적용되지 않으므로 여기에 admin 정책을 더해도 무의미)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_admin IS '운영자(슈퍼 계정) 여부. true면 /admin에서 전체 모집글·채팅 열람 가능';
