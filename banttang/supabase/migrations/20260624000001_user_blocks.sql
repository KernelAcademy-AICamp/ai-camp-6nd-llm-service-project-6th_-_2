-- 회원 차단(개인 간) — 채팅방 공개 프로필에서 상대를 차단/해제.
-- 신고(reports)와 별개다: 신고는 운영자 처리용, 차단은 "내 화면에서 이 사람을 안 보겠다".
-- 차단 시 상대 메시지 숨김은 클라이언트에서 처리(채팅 타임라인 필터).

CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id, created_at DESC);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- 본인이 만든 차단만 조회/추가/삭제. (서버 액션은 service key로 우회하며 blocker_id를 직접 검증)
CREATE POLICY "user_blocks_select_own"
    ON user_blocks FOR SELECT
    USING (auth.uid() = blocker_id);

CREATE POLICY "user_blocks_insert_own"
    ON user_blocks FOR INSERT
    WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "user_blocks_delete_own"
    ON user_blocks FOR DELETE
    USING (auth.uid() = blocker_id);

COMMENT ON TABLE user_blocks IS '회원 차단(개인 간). 채팅 프로필에서 차단/해제. 상대 메시지 숨김은 클라이언트.';
