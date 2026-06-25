-- ============================================================================
-- 반띵 — 채팅 시스템 이벤트 분리 (1/2: enum 값 추가)
-- Version: 1.3.0
-- Description: party_closed 하나가 "모집 완료·거래방 오픈"과 "파티원 퇴장" 두 의미로
--              섞여 로그/분석이 모호했다. 의미별 이벤트를 추가한다.
--                - chat_opened : 모집 완료되어 거래방이 열림
--                - member_left : 파티원이 채팅방을 나감
--              ※ ALTER TYPE ADD VALUE는 추가한 값을 같은 트랜잭션에서 사용할 수 없으므로,
--                트리거/함수 갱신(이 값을 사용)은 2/2 마이그레이션에서 따로 적용한다.
-- ============================================================================

ALTER TYPE system_event_type ADD VALUE IF NOT EXISTS 'chat_opened';
ALTER TYPE system_event_type ADD VALUE IF NOT EXISTS 'member_left';

NOTIFY pgrst, 'reload schema';
