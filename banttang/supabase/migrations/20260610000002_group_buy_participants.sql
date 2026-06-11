-- ============================================================================
-- 반띵(띵동) — 플랫폼 공동구매 참여자
-- Version: 1.0.0
-- ============================================================================
--
-- 플랫폼이 여는 공구(예: 신비복숭아)의 상품 정보는 코드 config(lib/groupbuy.ts)에
-- 두고, 회원의 "참여 신청"만 여기에 저장한다. slug 로 어떤 공구인지 식별.
--   - (slug, user_id) 유일 → 1인 1신청, 수량/옵션은 갱신 가능
--   - 결제는 앱 정책상 외부(플랫폼 미보관). 여기 행은 "참여 신청" 의미.
--
-- 참여 인원/수량 합계는 서버(admin)에서 집계하므로 RLS는 본인 행만 허용.
-- storage 구문 없음 → SQL Editor에서 롤백 없이 적용.
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_buy_participants (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug          text NOT NULL,                 -- 공구 식별자 (config의 slug)
    user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    option_label  text NOT NULL DEFAULT '',      -- 선택 옵션 (예: "1.6kg")
    quantity      int  NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (slug, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_buy_participants_slug
    ON group_buy_participants(slug);
CREATE INDEX IF NOT EXISTS idx_group_buy_participants_user
    ON group_buy_participants(user_id);

COMMENT ON TABLE group_buy_participants IS '플랫폼 공구 참여 신청. 상품 정보는 코드 config, 여기엔 참여자만.';

-- updated_at 자동 갱신 (기존 set_updated_at 재사용)
DROP TRIGGER IF EXISTS trg_group_buy_participants_updated ON group_buy_participants;
CREATE TRIGGER trg_group_buy_participants_updated
    BEFORE UPDATE ON group_buy_participants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE group_buy_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gbp_select_own" ON group_buy_participants;
CREATE POLICY "gbp_select_own"
    ON group_buy_participants FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "gbp_insert_own" ON group_buy_participants;
CREATE POLICY "gbp_insert_own"
    ON group_buy_participants FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "gbp_update_own" ON group_buy_participants;
CREATE POLICY "gbp_update_own"
    ON group_buy_participants FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "gbp_delete_own" ON group_buy_participants;
CREATE POLICY "gbp_delete_own"
    ON group_buy_participants FOR DELETE
    USING (auth.uid() = user_id);

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
