-- 로컬 시드. supabase db reset 시 자동 적용.
-- 운영 데이터는 절대 시드에 두지 말 것.

-- 데모용 사용자 1명은 auth.users 트리거를 거치지 않으므로 비워둔다.
-- 필요 시 `supabase auth users create` 또는 Studio에서 생성 후 여기서 보강.
