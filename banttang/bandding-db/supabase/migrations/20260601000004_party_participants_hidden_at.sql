-- 마이페이지·채팅 목록에서 본인만 숨기기 (soft delete) 용도.
-- 사용자가 진행완료/취소된 거래 카드를 "삭제"하면 hidden_at = NOW가 본인 row에만 기록된다.
-- 다른 멤버에겐 영향 없음 — 채팅방·파티 모두 그대로 유지됨.

ALTER TABLE party_participants
    ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

COMMENT ON COLUMN party_participants.hidden_at
    IS '본인만 목록에서 숨김 처리한 시각. NULL이면 정상 노출.';
