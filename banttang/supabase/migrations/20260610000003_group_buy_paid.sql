-- ============================================================================
-- 반띵(띵동) — 공구 참여자 입금 완료 표시
-- Version: 1.0.0
-- ============================================================================
--
-- 공구 안내 챗봇에서 "입금 완료했어요"를 누르면 기록되는 시각.
-- NULL = 입금 전, 값 있음 = 입금 확인 요청됨(확인 중).
-- storage 구문 없음 → SQL Editor에서 바로 적용.
-- ============================================================================

ALTER TABLE group_buy_participants
    ADD COLUMN IF NOT EXISTS marked_paid_at timestamptz;

COMMENT ON COLUMN group_buy_participants.marked_paid_at IS '유저가 입금 완료를 알린 시각. NULL이면 입금 전.';

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
