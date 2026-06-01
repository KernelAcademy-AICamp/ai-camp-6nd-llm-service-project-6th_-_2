-- 채팅 안 읽음 카운트용 — 각 참여자의 마지막 채팅 입장(읽음) 시각.
-- 이 컬럼이 NULL이면 참여자 가입(created_at) 이후 모든 메시지를 안 읽음으로 본다.
-- 사용자가 /chat/[partyId] 진입 시 NOW()로 UPDATE된다.

ALTER TABLE party_participants
    ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

-- 호출자의 (참여 중인) 파티별 안 읽음 메시지 수를 한 번에 반환.
-- party_id 기준 GROUP BY. unread_count=0인 파티도 포함(다른 통계와 join 편의).
-- sender가 본인이거나 last_read_at 이전 메시지는 제외.
CREATE OR REPLACE FUNCTION user_unread_counts(p_user_id uuid)
RETURNS TABLE(party_id uuid, unread_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        cr.party_id,
        COUNT(cm.id)::int AS unread_count
    FROM party_participants pp
    JOIN parties p ON p.id = pp.party_id
    JOIN chat_rooms cr ON cr.party_id = pp.party_id
    LEFT JOIN chat_messages cm
        ON cm.room_id = cr.id
       AND cm.created_at > COALESCE(pp.last_read_at, pp.approved_at, pp.applied_at)
       AND (cm.sender_id IS NULL OR cm.sender_id <> p_user_id)
    WHERE pp.user_id = p_user_id
      AND pp.status = 'approved'
      -- 취소된 파티는 더 이상 채팅 목록에 안 보이므로 카운트에서도 제외.
      -- (closed/in_progress/completed 만 카운트 — 채팅 목록 필터와 일치)
      AND p.status <> 'cancelled'
    GROUP BY cr.party_id;
$$;

COMMENT ON FUNCTION user_unread_counts(uuid)
    IS '내가 approved 멤버인 파티들의 안 읽음 메시지 수. 본인 발송 메시지는 제외.';
