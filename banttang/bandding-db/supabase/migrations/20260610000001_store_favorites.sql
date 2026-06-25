-- ============================================================================
-- 반띵 — 스토어 찜 (가게/상품 즐겨찾기)
-- Version: 1.0.0
-- ============================================================================
--
-- 스토어 카드는 네이버 검색(쇼핑/지역) 기반 "외부" 데이터라 내부 PK가 없다.
-- 그래서 찜은 화면 표시에 필요한 스냅샷(title/subtitle/link/image)을 그대로 저장하고,
-- (user_id, link) 를 유일키로 삼아 토글한다.
--   kind = 'store'(가게·지역)  |  'product'(상품·쇼핑)
--
-- 권한은 RLS로 본인 행만. (앱은 서버에서 admin 클라이언트로 접근하지만 2차 방어선)
-- storage 구문 없음 → SQL Editor에서 롤백 없이 적용된다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS store_favorites (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('store', 'product')),
    title       text NOT NULL,
    subtitle    text NOT NULL DEFAULT '',
    link        text NOT NULL,
    image       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, link)
);

CREATE INDEX IF NOT EXISTS idx_store_favorites_user
    ON store_favorites(user_id, created_at DESC);

COMMENT ON TABLE store_favorites IS '스토어(네이버 기반) 가게/상품 찜. (user_id, link) 유일.';

ALTER TABLE store_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_favorites_select_own" ON store_favorites;
CREATE POLICY "store_favorites_select_own"
    ON store_favorites FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "store_favorites_insert_own" ON store_favorites;
CREATE POLICY "store_favorites_insert_own"
    ON store_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "store_favorites_delete_own" ON store_favorites;
CREATE POLICY "store_favorites_delete_own"
    ON store_favorites FOR DELETE
    USING (auth.uid() = user_id);

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
