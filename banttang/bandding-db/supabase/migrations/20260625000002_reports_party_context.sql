-- ============================================================================
-- 반띵 — 신고에 거래(party) 컨텍스트 연결
-- Version: 1.0.0
-- ============================================================================
--
-- 설계: /admin/reports 분쟁 화면에서 "채팅 로그"를 바로 펼쳐 보려면, 신고가
--   어느 거래(채팅방)에서 발생했는지 알아야 한다. 기존엔 target_type='user'
--   신고에 거래 연결이 없어(reason_detail 텍스트뿐) 채팅을 찾을 수 없었다.
--   · party_id : 신고가 발생한 거래. target_type 무관하게 채팅방 점프에 사용.
--                거래 맥락이 없는 신고(커뮤니티 댓글 등)는 null.
-- ============================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES parties(id) ON DELETE SET NULL;

COMMENT ON COLUMN reports.party_id IS '신고가 발생한 거래(채팅 로그 점프용). 맥락 없으면 null.';

CREATE INDEX IF NOT EXISTS idx_reports_party_id ON reports(party_id);

NOTIFY pgrst, 'reload schema';
