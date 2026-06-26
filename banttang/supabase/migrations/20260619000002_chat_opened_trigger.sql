-- ============================================================================
-- 반띵 — 채팅 시스템 이벤트 분리 (2/2: 트리거 갱신)
-- Version: 1.3.0
-- Description: 정원 충족 시 거래방 오픈 메시지의 이벤트를 party_closed → chat_opened로,
--              문구를 더 명확하게 변경한다.
--              ※ 반드시 20260619000001_chat_system_events.sql 적용 후에 실행할 것.
-- ============================================================================

CREATE OR REPLACE FUNCTION on_participant_approved()
RETURNS TRIGGER AS $$
DECLARE
    approved_count int;
    party_max int;
    party_status_now party_status;
    was_approved boolean;
BEGIN
    was_approved := (TG_OP = 'UPDATE' AND OLD.status = 'approved');

    IF NEW.status = 'approved' AND NOT was_approved THEN
        SELECT max_participants, status
          INTO party_max, party_status_now
          FROM parties
         WHERE id = NEW.party_id
         FOR UPDATE;

        SELECT count(*) INTO approved_count
          FROM party_participants
         WHERE party_id = NEW.party_id AND status = 'approved';

        -- 정원 충족 → 모집 종료 + 거래방 오픈
        IF approved_count >= party_max AND party_status_now = 'recruiting' THEN
            UPDATE parties
               SET status    = 'closed',
                   closed_at = now()
             WHERE id = NEW.party_id;

            INSERT INTO chat_rooms (party_id) VALUES (NEW.party_id)
            ON CONFLICT (party_id) DO NOTHING;

            INSERT INTO chat_messages (room_id, type, system_event, content)
            SELECT id, 'system', 'chat_opened',
                   '모집이 완료되어 거래방이 열렸어요. 이제 주문과 나눔 일정을 확인해 주세요.'
              FROM chat_rooms WHERE party_id = NEW.party_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
